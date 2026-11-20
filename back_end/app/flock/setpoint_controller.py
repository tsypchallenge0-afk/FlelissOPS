import asyncio
import logging
from datetime import datetime
from typing import Optional
from bson.objectid import ObjectId

logger = logging.getLogger(__name__)

from .interpolator import interpolate_setpoints
from app.database import db
from app.websocket.manager import manager

async def apply_setpoints_now(flock_id: str):
    """
    Reads today's interpolated setpoints and writes them to actuator_states.
    Called whenever:
    - A new flock is placed
    - Curves are created or updated
    - The daily scheduled job runs
    """
    try:
        # ── Get flock ─────────────────────────────────────────────────────
        try:
            flock = db.flocks.find_one({'_id': ObjectId(flock_id)})
        except:
            flock = db.flocks.find_one({'_id': flock_id})
            
        if not flock or flock.get('status') != 'active':
            return

        house_id = flock['house_id']
        placement_date = flock.get('placement_date')
        if isinstance(placement_date, str):
            pd = datetime.fromisoformat(placement_date.replace("Z", "+00:00")).replace(tzinfo=None)
        else:
            pd = placement_date
            
        age_days = (datetime.utcnow() - pd).days if pd else 0

        # ── Get curves ────────────────────────────────────────────────────
        curves = list(db.flock_setpoint_curves.find({'flock_id': flock_id}))
        if not curves:
            return

        for curve in curves:
            sp = interpolate_setpoints(curve['checkpoints'], age_days)

            if curve['curve_type'] == 'environmental':
                await _apply_environmental_setpoints(house_id, sp, flock_id, age_days)

            elif curve['curve_type'] == 'nutritional':
                await _apply_nutritional_setpoints(house_id, sp, flock_id, age_days)

    except Exception as e:
        logger.error(f'[SetpointController] apply_setpoints_now failed: {e}')


async def _apply_environmental_setpoints(
    house_id: str, sp: dict, flock_id: str, age_days: int
):
    """
    Applies environmental setpoints to actuator_states.
    Only updates devices that are in AUTO mode — never overrides manual.
    """
    # ── Heater: set target temperature ───────────────────────────────────
    if sp.get('temperature_c') is not None:
        heater_state = db.actuator_states.find_one(
            {'house_id': house_id, 'device_type': 'heater'}
        )
        if heater_state and heater_state.get('mode') == 'auto':
            db.actuator_states.update_one(
                {'house_id': house_id, 'device_type': 'heater'},
                {'$set': {
                    'state.target_temp': sp['temperature_c'],
                    'updated_at':        datetime.utcnow().isoformat(),
                    'updated_by':        'SETPOINT_CURVE',
                }},
                upsert=True
            )
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(manager.broadcast({
                    'type':       'control_update',
                    'house_id':   house_id,
                    'device_type':'heater',
                    'mode':       'auto',
                    'state':      {'target_temp': sp.get('temperature_c')},
                    'updated_by': 'SETPOINT_CURVE',
                    'timestamp':  datetime.utcnow().isoformat(),
                }))
            except RuntimeError:
                pass
                
    # ── Fans: derive speed from air requirement ───────────────────────────
    if sp.get('air_requirement') is not None:
        try:
            flock = db.flocks.find_one({'_id': ObjectId(flock_id)})
        except:
            flock = db.flocks.find_one({'_id': flock_id})
            
        if flock:
            # Simple estimation logic, can be replaced by compute_kpis logic later
            target_weight_g = sp.get('female_weight_g', 1000)
            live_count = flock.get('placement_count', 1000)
            
            total_weight_kg = (target_weight_g / 1000) * live_count
            required_airflow = sp['air_requirement'] * total_weight_kg
            MAX_AIRFLOW_M3H = 50000
            fan_speed_pct = min(100, round((required_airflow / MAX_AIRFLOW_M3H) * 100))

            fan_state = db.actuator_states.find_one(
                {'house_id': house_id, 'device_type': 'fan'}
            )
            if fan_state and fan_state.get('mode') == 'auto':
                db.actuator_states.update_one(
                    {'house_id': house_id, 'device_type': 'fan'},
                    {'$set': {
                        'state.speed_percent': fan_speed_pct,
                        'state.running':       fan_speed_pct > 0,
                        'updated_at':          datetime.utcnow().isoformat(),
                        'updated_by':          'SETPOINT_CURVE',
                    }},
                    upsert=True
                )
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(manager.broadcast({
                        'type':       'control_update',
                        'house_id':   house_id,
                        'device_type':'fan',
                        'mode':       'auto',
                        'state':      {'speed_percent': fan_speed_pct, 'running': fan_speed_pct > 0},
                        'updated_by': 'SETPOINT_CURVE',
                        'timestamp':  datetime.utcnow().isoformat(),
                    }))
                except RuntimeError:
                    pass

async def _apply_nutritional_setpoints(
    house_id: str, sp: dict, flock_id: str, age_days: int
):
    """
    Applies nutritional setpoints to feeder and waterer actuators.
    Sets daily portion targets based on the curve for today's age.
    """
    if sp.get('female_feed_g') is not None:
        try:
            flock = db.flocks.find_one({'_id': ObjectId(flock_id)})
        except:
            flock = db.flocks.find_one({'_id': flock_id})
            
        if flock:
            live_count = flock.get('placement_count', 1000) 

            # Total feed for house = per-bird allocation × live birds / 1000 (kg)
            total_feed_kg = (sp['female_feed_g'] * live_count) / 1000
            # Spread across 4 feedings
            portion_per_feeding = round(total_feed_kg / 4, 2)

            feeder_state = db.actuator_states.find_one(
                {'house_id': house_id, 'device_type': 'feeder'}
            )
            if feeder_state and feeder_state.get('mode') == 'auto':
                db.actuator_states.update_one(
                    {'house_id': house_id, 'device_type': 'feeder'},
                    {'$set': {
                        'state.portion_kg':    portion_per_feeding,
                        'state.daily_total_kg':total_feed_kg,
                        'updated_at':          datetime.utcnow().isoformat(),
                        'updated_by':          'SETPOINT_CURVE',
                    }},
                    upsert=True
                )
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(manager.broadcast({
                        'type':       'control_update',
                        'house_id':   house_id,
                        'device_type':'feeder',
                        'mode':       'auto',
                        'state':      {'portion_kg': portion_per_feeding, 'daily_total_kg': total_feed_kg},
                        'updated_by': 'SETPOINT_CURVE',
                        'timestamp':  datetime.utcnow().isoformat(),
                    }))
                except RuntimeError:
                    pass

async def daily_setpoint_update_loop(house_ids: list):
    """
    Background loop that updates setpoints once per hour.
    Registered in app startup alongside AI control loop.
    """
    while True:
        await asyncio.sleep(3600)   # every hour
        for house_id in house_ids:
            try:
                # Get active flock for house
                flock = db.flocks.find_one(
                    {'house_id': house_id, 'status': 'active'}
                )
                if flock:
                    await apply_setpoints_now(str(flock['_id']))
            except Exception as e:
                logger.error(f'[SetpointController] daily loop error: {e}')
