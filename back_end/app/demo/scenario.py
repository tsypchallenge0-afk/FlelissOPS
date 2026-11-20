"""
Heat-stress demo scenario — shows the whole closed loop in about a minute.

Only the *weather* is synthetic. Everything else is the production path:
  readings for the house's real sensors → stored like any telemetry (tagged
  source="demo_scenario") → alert rules evaluated → live WebSocket broadcast →
  the real AI decision function runs on the stored data → its decisions are
  executed exactly like the 30-second control loop does (actuator state,
  control_commands audit log, WebSocket, MQTT command to the hardware).

Progress is broadcast as WebSocket messages of type "demo_scenario".
"""
import asyncio
import logging
import random
import time
from datetime import datetime, timezone
from typing import Optional

from app.ai import control_loop
from app.ai.predictor import get_predictions
from app.database import db
from app.telemetry.router import evaluate_alerts
from app.websocket.manager import manager

logger = logging.getLogger(__name__)

SENSOR_TYPES = ["temperature_humidity", "ammonia", "combined"]
DANGER_TEMP = 35.0          # matches the default temperature danger rule
PEAK_TEMP = 36.6
STEP_SECONDS = 2.0
HEAT_STEPS = 12             # ~24 s ramp up
HOLD_STEPS = 3
RECOVERY_STEPS = 12         # ~24 s ramp down

# house_id -> {"task": asyncio.Task, "status": dict}
_runs: dict = {}


def house_sensors(house_id: str, tenant_id: Optional[str]) -> list:
    q = {"house_id": house_id, "$or": [{"type": {"$in": SENSOR_TYPES}}, {"device_type": {"$in": SENSOR_TYPES}}]}
    if tenant_id:
        q["tenant_id"] = tenant_id
    return list(db.devices.find(q))


def status(house_id: str) -> dict:
    run = _runs.get(house_id)
    return run["status"] if run else {"state": "idle", "house_id": house_id}


def is_running(house_id: str) -> bool:
    run = _runs.get(house_id)
    return bool(run and not run["task"].done())


def start(house_id: str, tenant_id: Optional[str], sensors: list, started_by: str) -> dict:
    st = {"state": "running", "house_id": house_id, "phase": "starting", "started_by": started_by,
          "started_at": datetime.utcnow().isoformat(), "log": []}
    task = asyncio.create_task(_run(house_id, tenant_id, sensors, st))
    _runs[house_id] = {"task": task, "status": st}
    return st


def _alerts_triggered(device_ids: list, since_iso: str) -> int:
    """Alerts raised *or re-triggered* on these sensors since the scenario started
    (repeat runs update the still-open alert instead of creating a duplicate)."""
    return db.alerts.count_documents({"device_id": {"$in": device_ids},
                                      "$or": [{"timestamp": {"$gte": since_iso}}, {"last_seen_at": {"$gte": since_iso}}]})


def _latest(device_id: str) -> dict:
    return db.telemetry.find_one({"device_id": device_id}, sort=[("timestamp", -1)]) or {}


async def _emit(st: dict, tenant_id, **fields):
    st.update(fields)
    if "message" in fields:
        st["log"].append({"t": round(time.monotonic() - st["_t0"], 1), "phase": st.get("phase"), "message": fields["message"]})
    msg = {k: v for k, v in st.items() if not k.startswith("_")}
    await manager.broadcast({"type": "demo_scenario", "tenant_id": tenant_id, **msg})


async def _ingest(sensor: dict, house_id: str, tenant_id, temp: float, hum: float, nh3: float) -> list:
    """Store one reading through the same steps as /telemetry/send (without the deadband)."""
    now = datetime.now(timezone.utc)
    device_id = str(sensor["_id"])
    doc = {"device_id": device_id, "house_id": house_id, "tenant_id": tenant_id,
           "temperature": round(temp, 2), "humidity": round(hum, 2), "ammonia": round(nh3, 2),
           "timestamp": now, "source": "demo_scenario"}
    res = db.telemetry.insert_one(dict(doc))
    db.devices.update_one({"_id": sensor["_id"]}, {"$set": {"status": "online", "last_seen": now}})
    payload = {**doc, "_id": str(res.inserted_id), "timestamp": now.isoformat()}
    await manager.broadcast({"type": "telemetry", "data": payload, **payload})
    return await evaluate_alerts(None, device_id, payload, tenant_id=tenant_id) or []


async def _ai_respond(house_id: str) -> list:
    """Run the real AI decision function now and execute its decisions."""
    predictions = await asyncio.to_thread(get_predictions, house_id)
    decisions = control_loop.evaluate_predictions(house_id, predictions or {})
    results = []
    for d in decisions:
        if d.device_type not in ("fan", "heater"):
            continue        # lighting/feeder schedules are not part of this scenario
        if not await control_loop.is_device_in_auto_mode(house_id, d.device_type):
            results.append({"device": d.device_type, "executed": False, "reason": f"{d.device_type} is in MANUAL mode — AI may not override"})
            continue
        control_loop._last_command_time.pop(control_loop._cooldown_key(house_id, d.device_type), None)
        ok = await control_loop.execute_decision(d)
        results.append({"device": d.device_type, "executed": ok, "command": d.command, "payload": d.payload, "reason": d.reason})
    return results


async def _run(house_id: str, tenant_id, sensors: list, st: dict):
    st["_t0"] = time.monotonic()
    try:
        base = {}
        for s in sensors:
            r = _latest(str(s["_id"]))
            base[str(s["_id"])] = (float(r.get("temperature") or 28.0), float(r.get("humidity") or 62.0), float(r.get("ammonia") or 9.0))
        start_temp = sum(b[0] for b in base.values()) / len(base)
        await _emit(st, tenant_id, phase="heat_wave", progress=0,
                    message=f"Heat wave starting — {len(sensors)} sensor(s) at {start_temp:.1f} °C")

        started_iso = datetime.utcnow().isoformat()
        device_ids = [str(s["_id"]) for s in sensors]
        alerts_raised, peak, ai_actions = 0, start_temp, []
        breach_at: Optional[float] = None
        latency_ms: Optional[float] = None
        total = HEAT_STEPS + HOLD_STEPS + RECOVERY_STEPS

        for step in range(total):
            if step < HEAT_STEPS + HOLD_STEPS:
                # stays on "ai_response" once the AI has acted, until recovery begins
                phase, f = ("ai_response" if ai_actions else "heat_wave"), min(1.0, (step + 1) / HEAT_STEPS)
            else:
                phase, f = "recovery", 1 - (step - HEAT_STEPS - HOLD_STEPS + 1) / RECOVERY_STEPS

            step_max = 0.0
            for i, s in enumerate(sensors):
                t0, h0, n0 = base[str(s["_id"])]
                temp = t0 + (PEAK_TEMP + 0.3 * i - t0) * f + random.gauss(0, 0.08)
                hum = h0 + 9 * f + random.gauss(0, 0.3)
                nh3 = n0 + 3 * f + random.gauss(0, 0.1)
                await _ingest(s, house_id, tenant_id, temp, hum, nh3)
                step_max = max(step_max, temp)
                if breach_at is None and temp >= DANGER_TEMP:
                    breach_at = time.perf_counter()
            peak = max(peak, step_max)
            alerts_raised = _alerts_triggered(device_ids, started_iso)

            if breach_at is not None and not ai_actions:
                await _emit(st, tenant_id, phase="ai_response",
                            message=f"Danger threshold {DANGER_TEMP:.0f} °C crossed ({step_max:.1f} °C) — danger alert active, AI evaluating")
                ai_actions = await _ai_respond(house_id)
                latency_ms = round((time.perf_counter() - breach_at) * 1000)
                done = [a for a in ai_actions if a["executed"]]
                summary = "; ".join(f"{a['device']}: {a['reason']}" for a in ai_actions) or "no action needed"
                await _emit(st, tenant_id, ai_actions=ai_actions, ai_latency_ms=latency_ms,
                            message=f"AI issued {len(done)} command(s) in {latency_ms} ms — {summary}")

            await _emit(st, tenant_id, phase=phase, progress=round((step + 1) / total * 100),
                        current_max_temp=round(step_max, 1), peak_temp=round(peak, 1), alerts_raised=alerts_raised)
            await asyncio.sleep(STEP_SECONDS)

        await _emit(st, tenant_id, state="completed", phase="done", progress=100,
                    message=(f"Recovered to {start_temp:.1f} °C. Peak {peak:.1f} °C, {alerts_raised} alert(s), "
                             f"{len([a for a in ai_actions if a['executed']])} AI command(s)"
                             + (f", breach → AI command {latency_ms} ms" if latency_ms is not None else "")))
    except asyncio.CancelledError:
        await _emit(st, tenant_id, state="cancelled", phase="done", message="Scenario cancelled")
        raise
    except Exception as e:
        logger.exception("Demo scenario failed for %s", house_id)
        await _emit(st, tenant_id, state="failed", phase="done", message=f"Scenario failed: {e}")
