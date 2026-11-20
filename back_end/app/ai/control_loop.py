import asyncio
import logging
import uuid
from datetime import datetime
from typing import Optional
from dataclasses import dataclass
from app.ai.dependencies import np, NUMPY_AVAILABLE

from app.database import db
from app.websocket.manager import manager as ws_manager
from app.ai.config import METRICS
from app.ai.predictor import get_predictions
from app.core.mqtt import mqtt_client
import json

logger = logging.getLogger(__name__)

# ── Decision thresholds ────────────────────────────────────────────────────

@dataclass
class ControlDecision:
    house_id:       str
    device_type:    str        # 'fan' | 'heater' | 'lighting' | 'feeder'
    command:        str        # 'set_speed' | 'set_target_temp' | 'activate'
    payload:        dict       # the actual command value
    reason:         str        # human-readable explanation
    triggered_by:   str        # 'temperature_breach' | 'humidity_breach' | 'ammonia_breach'
    metric:         str
    metric_value:   float
    predicted_value: float
    minutes_to_breach: Optional[float]
    confidence:     str        # 'high' | 'medium' | 'low'
    tier:           int        # AI tier that triggered this


# Confidence gate — only act if confidence is at least this level
MIN_CONFIDENCE_TO_ACT = 'low'
CONFIDENCE_RANK = {'low': 0, 'medium': 1, 'high': 2}

# Control loop interval
LOOP_INTERVAL_SECONDS = 30     # evaluate every 30 seconds

# Cooldown — don't issue the same command to the same device within N seconds
COMMAND_COOLDOWN_SECONDS = 120

# Track last command time per house+device to enforce cooldown
_last_command_time: dict = {}

def _cooldown_key(house_id: str, device_type: str) -> str:
    return f'{house_id}:{device_type}'

def _is_on_cooldown(house_id: str, device_type: str) -> bool:
    key = _cooldown_key(house_id, device_type)
    last = _last_command_time.get(key)
    if not last:
        return False
    elapsed = (datetime.utcnow() - last).total_seconds()
    return elapsed < COMMAND_COOLDOWN_SECONDS

def _mark_command_sent(house_id: str, device_type: str):
    key = _cooldown_key(house_id, device_type)
    _last_command_time[key] = datetime.utcnow()


# ── Decision logic ─────────────────────────────────────────────────────────

def get_flock_age_days(house_id: str) -> int:
    """
    Get the age of the active flock in the house.
    Returns 0 if no active flock is found.
    """
    flock = db.flocks.find_one({
        "house_id": house_id,
        "status": "active"
    })
    if not flock or "placement_date" not in flock:
        return 0
    try:
        if isinstance(flock["placement_date"], str):
            placement = datetime.fromisoformat(flock["placement_date"].replace('Z', '+00:00')).replace(tzinfo=None)
        else:
            placement = flock["placement_date"].replace(tzinfo=None)
        age = (datetime.utcnow() - placement).days
        return max(0, age)
    except Exception as e:
        logger.error(f"Error calculating flock age: {e}")
        return 0

def get_target_temperature(age_days: int) -> float:
    """
    Standard Ross 308 Brooding Temperature Curve.
    Day 0-3: 32.0C
    Day 4-7: 31.0C
    Day 8-14: 29.0C
    Day 15-21: 27.0C
    Day 22-28: 24.0C
    Day 29+: 21.0C
    """
    if age_days <= 3: return 32.0
    if age_days <= 7: return 31.0
    if age_days <= 14: return 29.0
    if age_days <= 21: return 27.0
    if age_days <= 28: return 24.0
    return 21.0

REACTIVE_WINDOW_SECONDS = 120   # fallback uses measured readings from the last 2 minutes


def _reactive_reading(house_id: str, metric: str) -> Optional[dict]:
    """
    Fallback when the forecaster has too little history (e.g. sensors just came online):
    the mean of the readings actually measured in the last couple of minutes. A measured
    breach must trigger a response even without a forecast.
    """
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(seconds=REACTIVE_WINDOW_SECONDS)
    rows = list(db.telemetry.find(
        {"house_id": house_id, metric: {"$ne": None},
         "$or": [{"timestamp": {"$gte": since}}, {"timestamp": {"$gte": since.isoformat()}}]},
        {metric: 1}).sort("timestamp", -1).limit(50))
    vals = [r[metric] for r in rows if isinstance(r.get(metric), (int, float))]
    if not vals:
        return None
    current = sum(vals[:10]) / len(vals[:10])          # latest readings only
    warn = METRICS[metric].warn_threshold
    return {"available": True, "current_value": current, "confidence": "medium", "tier": 0,
            "will_breach_warn": current >= warn, "minutes_to_warn": 0 if current >= warn else None,
            "source": "reactive"}


def evaluate_predictions(house_id: str, predictions: dict) -> list[ControlDecision]:
    """
    Given prediction output for a house, decide what corrective actions
    to take. Returns a list of ControlDecision objects.
    """
    decisions = []
    preds = predictions.get('predictions', {})

    # 1. Extract values
    def get_pred_val(metric_name):
        p = preds.get(metric_name, {})
        if not p.get('available') or CONFIDENCE_RANK.get(p.get('confidence', 'low'), 0) < CONFIDENCE_RANK[MIN_CONFIDENCE_TO_ACT]:
            return None
        return p

    temp_p = get_pred_val('temperature') or _reactive_reading(house_id, 'temperature')
    amm_p = get_pred_val('ammonia') or _reactive_reading(house_id, 'ammonia')
    hum_p = get_pred_val('humidity') or _reactive_reading(house_id, 'humidity')

    age_days = get_flock_age_days(house_id)
    target_temp = get_target_temperature(age_days)

    # 2. Evaluate state
    needs_heat = False
    needs_cooling = False
    needs_ammonia_vent = False
    needs_humidity_vent = False

    current_temp = temp_p.get('current_value', 0) if temp_p else 0
    if temp_p:
        # Buffer of 1.0C around target
        if current_temp < target_temp - 1.0:
            needs_heat = True
        elif current_temp > target_temp + 1.5 or temp_p.get('will_breach_warn'):
            needs_cooling = True

    if amm_p and (amm_p.get('will_breach_warn') or amm_p.get('current_value', 0) > METRICS['ammonia'].warn_threshold):
        needs_ammonia_vent = True

    if hum_p and (hum_p.get('will_breach_warn') or hum_p.get('current_value', 0) > METRICS['humidity'].warn_threshold):
        needs_humidity_vent = True

    # 3. Conflict Resolution & Action Generation
    if needs_heat and needs_ammonia_vent:
        # CONFLICT: High ammonia needs fans, but temp is low and needs heat.
        # Action: Pulse Ventilation (Fan 30%) + Heater ON
        decisions.append(ControlDecision(
            house_id=house_id,
            device_type='fan',
            command='set_speed',
            payload={'speed_percent': 30, 'running': True},
            reason=f'Conflict: High Ammonia ({amm_p.get("current_value"):.1f}ppm) but Low Temp ({current_temp:.1f}°C). Using Pulse Ventilation.',
            triggered_by='conflict_resolution',
            metric='ammonia',
            metric_value=amm_p.get('current_value', 0),
            predicted_value=amm_p.get('current_value', 0),
            minutes_to_breach=amm_p.get('minutes_to_warn'),
            confidence=amm_p.get('confidence'),
            tier=amm_p.get('tier', 1)
        ))
        decisions.append(ControlDecision(
            house_id=house_id,
            device_type='heater',
            command='set_target_temp',
            payload={'target_temp': target_temp + 1.0, 'running': True},
            reason=f'Conflict: Maintaining heat during Pulse Ventilation. Target: {target_temp}°C',
            triggered_by='conflict_resolution',
            metric='temperature',
            metric_value=current_temp,
            predicted_value=temp_p.get('current_value', 0),
            minutes_to_breach=None,
            confidence=temp_p.get('confidence'),
            tier=temp_p.get('tier', 1)
        ))

    elif needs_cooling or needs_ammonia_vent or needs_humidity_vent:
        # STANDARD COOLING/VENTILATION (No conflict)
        fan_speed = 0
        reasons = []
        if needs_cooling:
            urgency = max(0.0, 1.0 - (temp_p.get('minutes_to_warn') or 30) / 30)
            fan_speed = max(fan_speed, int(60 + urgency * 40))
            reasons.append(f"High Temp ({current_temp:.1f}°C > {target_temp}°C)")
        if needs_ammonia_vent:
            urgency = max(0.0, 1.0 - (amm_p.get('minutes_to_warn') or 20) / 20)
            fan_speed = max(fan_speed, int(70 + urgency * 30))
            reasons.append(f"High Ammonia ({amm_p.get('current_value'):.1f}ppm)")
        if needs_humidity_vent:
            fan_speed = max(fan_speed, 85)
            reasons.append(f"High Hum ({hum_p.get('current_value'):.1f}%)")

        decisions.append(ControlDecision(
            house_id=house_id,
            device_type='fan',
            command='set_speed',
            payload={'speed_percent': fan_speed, 'running': True},
            reason=f"Ventilation increased to {fan_speed}% due to: {', '.join(reasons)}",
            triggered_by='ventilation_required',
            metric='multiple',
            metric_value=current_temp,
            predicted_value=current_temp,
            minutes_to_breach=None,
            confidence='high',
            tier=1
        ))

        # Turn off heater if it's on
        decisions.append(ControlDecision(
            house_id=house_id,
            device_type='heater',
            command='set_target_temp',
            payload={'target_temp': 0, 'running': False},
            reason="Cooling/Ventilation active, ensuring heater is OFF.",
            triggered_by='ventilation_required',
            metric='multiple',
            metric_value=0,
            predicted_value=0,
            minutes_to_breach=None,
            confidence='high',
            tier=1
        ))

    elif needs_heat:
        # STANDARD HEATING
        decisions.append(ControlDecision(
            house_id=house_id,
            device_type='heater',
            command='set_target_temp',
            payload={'target_temp': target_temp + 1.0, 'running': True},
            reason=f'Low Temp ({current_temp:.1f}°C < target {target_temp}°C). Heater ON.',
            triggered_by='temperature_low',
            metric='temperature',
            metric_value=current_temp,
            predicted_value=temp_p.get('current_value', 0),
            minutes_to_breach=None,
            confidence=temp_p.get('confidence'),
            tier=temp_p.get('tier', 1)
        ))
        # Turn off fans or set to minimum
        decisions.append(ControlDecision(
            house_id=house_id,
            device_type='fan',
            command='set_speed',
            payload={'speed_percent': 0, 'running': False},
            reason="Heating active, fans disabled to conserve heat.",
            triggered_by='temperature_low',
            metric='temperature',
            metric_value=current_temp,
            predicted_value=temp_p.get('current_value', 0),
            minutes_to_breach=None,
            confidence=temp_p.get('confidence'),
            tier=temp_p.get('tier', 1)
        ))
    elif temp_p is not None:
        # Ideal conditions (only when we actually know the temperature). Maintain baseline.
        decisions.append(ControlDecision(
            house_id=house_id,
            device_type='fan',
            command='set_speed',
            payload={'speed_percent': 0, 'running': False},
            reason=f"Ideal conditions (Target: {target_temp}°C). Maintaining baseline.",
            triggered_by='ideal_conditions',
            metric='multiple',
            metric_value=0,
            predicted_value=0,
            minutes_to_breach=None,
            confidence='high',
            tier=1
        ))
        decisions.append(ControlDecision(
            house_id=house_id,
            device_type='heater',
            command='set_target_temp',
            payload={'target_temp': 0, 'running': False},
            reason="Ideal conditions. Heater OFF.",
            triggered_by='ideal_conditions',
            metric='multiple',
            metric_value=0,
            predicted_value=0,
            minutes_to_breach=None,
            confidence='high',
            tier=1
        ))

    # Lighting Control (Time based)
    hour = datetime.utcnow().hour
    # Broilers: Lights off from midnight to 4 AM (4 hours dark)
    lights_on = not (0 <= hour < 4)
    decisions.append(ControlDecision(
        house_id=house_id,
        device_type='lighting',
        command='activate',
        payload={'on': lights_on, 'brightness': 100 if lights_on else 0},
        reason=f"Photoperiod schedule: Hour {hour}. Lights {'ON' if lights_on else 'OFF'}.",
        triggered_by='schedule',
        metric='time',
        metric_value=hour,
        predicted_value=hour,
        minutes_to_breach=None,
        confidence='high',
        tier=1
    ))

    return decisions


async def is_device_in_auto_mode(house_id: str, device_type: str) -> bool:
    """
    Check the actuator_states table to verify the device is in AUTO mode.
    AI must not issue commands to devices in MANUAL mode.
    """
    row = db.actuator_states.find_one({
        "house_id": house_id,
        "device_type": device_type
    })
    return row["mode"] == 'auto' if row else True  # default to auto if not found


async def execute_decision(decision: ControlDecision) -> bool:
    """
    Write the command to actuator_states, log it to control_commands,
    and broadcast via WebSocket.
    Returns True on success.
    """
    try:
        now = datetime.utcnow().isoformat()

        # Resolve tenant_id for the house
        house = db.houses.find_one({"_id": decision.house_id})
        if not house:
            from bson import ObjectId
            try:
                house = db.houses.find_one({"_id": ObjectId(decision.house_id)})
            except: pass
        tenant_id = house.get("tenant_id") if house else "default"

        # ── 1. Update actuator_states ────────────────────────────────────
        row = db.actuator_states.find_one({
            "house_id": decision.house_id,
            "device_type": decision.device_type
        })

        if not row:
            actuator_id = str(uuid.uuid4())
            new_state = decision.payload
            db.actuator_states.insert_one({
                "_id": actuator_id,
                "house_id": decision.house_id,
                "device_type": decision.device_type,
                "tenant_id": tenant_id, # Inject tenant
                "mode": "auto",
                "state": new_state,
                "updated_at": now,
                "updated_by": "AI_SYSTEM"
            })
        else:
            new_state = row.get("state", {})
            new_state.update(decision.payload)
            db.actuator_states.update_one(
                {"_id": row["_id"]},
                {"$set": {
                    "state": new_state,
                    "updated_at": now,
                    "updated_by": "AI_SYSTEM",
                    "tenant_id": tenant_id # Ensure tenant is set
                }}
            )

        # ── 2. Log to control_commands (immutable audit) ─────────────────
        db.control_commands.insert_one({
            "_id": str(uuid.uuid4()),
            "house_id": decision.house_id,
            "tenant_id": tenant_id, # Inject tenant
            "device_type": decision.device_type,
            "command": decision.command,
            "payload": decision.payload,
            "mode_before": "auto",
            "mode_after": "auto",
            "operator_id": "AI_SYSTEM",
            "operator_role": "system",
            "reason": decision.reason,
            "outcome": "success",
            "created_at": now,
            "triggered_by": decision.triggered_by,
            "metric": decision.metric,
            "metric_value": decision.metric_value,
            "predicted_value": decision.predicted_value,
            "confidence": decision.confidence,
            "tier": decision.tier
        })

        # ── 3. Broadcast WebSocket message (AI specific) ─────────────────
        await ws_manager.broadcast({
            'type':            'ai_action',
            'tenant_id':       tenant_id, # Inject tenant
            'house_id':        decision.house_id,
            'timestamp':       now,
            'device_type':     decision.device_type,
            'command':         decision.command,
            'payload':         decision.payload,
            'reason':          decision.reason,
            'triggered_by':    decision.triggered_by,
            'metric':          decision.metric,
            'metric_value':    decision.metric_value,
            'predicted_value': decision.predicted_value,
            'confidence':      decision.confidence,
            'tier':            decision.tier,
            'operator_id':     'AI_SYSTEM',
        })

        # ── 4. Also broadcast control_update so widgets update ───────────
        await ws_manager.broadcast({
            'type':        'control_update',
            'tenant_id':   tenant_id, # Inject tenant
            'house_id':    decision.house_id,
            'device_type': decision.device_type,
            'mode':        'auto',
            'state':       new_state,
            'updated_by':  'AI_SYSTEM',
            'timestamp':   now,
        })

        # ── 5. NEW: Publish MQTT Command to Hardware ───────────────────
        if mqtt_client:
            try:
                mqtt_topic = f"commands/{decision.house_id}/{decision.device_type}"
                mqtt_payload = {
                    "command": decision.command,
                    "state": new_state,
                    "mode": "auto",
                    "reason": decision.reason,
                    "triggered_by": decision.triggered_by,
                    "timestamp": now
                }
                mqtt_client.publish(mqtt_topic, json.dumps(mqtt_payload))
                logger.info(f"📡 AI MQTT: Published autonomous command to {mqtt_topic}")
            except Exception as e:
                logger.error(f"❌ AI MQTT: Failed to publish command: {e}")

        _mark_command_sent(decision.house_id, decision.device_type)
        logger.info(
            f'[AI Control] {decision.house_id} → {decision.device_type}: '
            f'{decision.command} {decision.payload} | {decision.reason}'
        )
        return True

    except Exception as e:
        logger.error(f'[AI Control] Execute failed: {e}')
        return False


async def run_control_loop(house_ids: list):
    """
    Main control loop. Runs indefinitely.
    Call from your app startup alongside other background tasks.
    """
    logger.info(f'[AI Control] Loop started for {len(house_ids)} houses')

    while True:
        await asyncio.sleep(LOOP_INTERVAL_SECONDS)

        for house_id in house_ids:
            try:
                # Get latest predictions
                predictions = get_predictions(house_id)
                if not predictions:
                    continue

                # Evaluate what actions to take
                decisions = evaluate_predictions(house_id, predictions)

                for decision in decisions:
                    # Skip if device is in manual mode
                    in_auto = await is_device_in_auto_mode(
                        decision.house_id, decision.device_type
                    )
                    if not in_auto:
                        logger.debug(
                            f'[AI Control] Skipping {decision.device_type} '
                            f'in {house_id} — manual mode'
                        )
                        continue

                    # Skip if on cooldown
                    if _is_on_cooldown(decision.house_id, decision.device_type):
                        logger.debug(
                            f'[AI Control] Skipping {decision.device_type} '
                            f'in {house_id} — cooldown active'
                        )
                        continue

                    # Execute the decision
                    await execute_decision(decision)

            except Exception as e:
                logger.error(f'[AI Control] Loop error for {house_id}: {e}')
