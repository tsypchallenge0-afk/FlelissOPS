from fastapi import APIRouter, Depends, HTTPException
from app.database import db

from fastapi import Request
from app.utils.tenant_query import scoped, tag, scoped_pipeline
from app.utils.quota import check_quota
from app.schemas.house_schema import HouseOut
from app.schemas.control_schema import ModeUpdate, FanControl, FanBoost, HeaterControl, HeaterActivate, FeederTrigger, FeederSchedule, LightingControl
from app.auth.dependencies import require_auth
from app.websocket.manager import manager
from datetime import datetime, timedelta
import uuid
from bson.objectid import ObjectId
from bson.errors import InvalidId
from app.core.mqtt import mqtt_client
import json

router = APIRouter(
    prefix="/houses",
    tags=["Houses"],
    redirect_slashes=False
)


@router.get("")
def get_all_houses(request: Request, user: dict = Depends(require_auth())):
    """Get all houses (for frontend listing)"""
    houses = list(db.houses.find(scoped(request, {})))
    for h in houses:
        h["id"] = str(h.pop("_id"))
    return houses


@router.get("/{house_id}", response_model=HouseOut)
def get_house(request: Request, house_id: str, user: dict = Depends(require_auth())):
    h = None
    try:
        h = db.houses.find_one(scoped(request, {"_id": ObjectId(house_id)}))
    except InvalidId:
        pass
    
    if not h:
        h = db.houses.find_one(scoped(request, {"_id": house_id}))

    if not h:
        raise HTTPException(status_code=404, detail="House not found")
    out = HouseOut(id=str(h["_id"]), **h)
    return out


@router.get("/{house_id}/devices")
def get_house_devices(request: Request, house_id: str, user: dict = Depends(require_auth())):
    devices = list(db.devices.find(scoped(request, {"house_id": house_id})))
    for d in devices:
        d["id"] = str(d.pop("_id"))
    return devices


@router.get("/{house_id}/controls")
def get_house_controls(request: Request, house_id: str, user: dict = Depends(require_auth())):
    controls = list(db.actuator_states.find(scoped(request, {"house_id": house_id})))
    for c in controls:
        c["id"] = str(c.pop("_id"))
    return controls


async def perform_actuator_update(request: Request, 
        house_id: str,
        device_type: str,
        state_update: dict,
        mode: str,
        operator_id: str,
        command: str,
        payload: dict):
    now = datetime.utcnow().isoformat()
    current = db.actuator_states.find_one(
        {"house_id": house_id, "device_type": device_type})

    if not current:
        actuator_id = str(uuid.uuid4())
        current = {
            "_id": actuator_id,
            "house_id": house_id,
            "device_type": device_type,
            "mode": "auto",
            "state": {},
            "updated_at": now,
            "updated_by": operator_id
        }
        db.actuator_states.insert_one(tag(request, current))

    new_state = current.get("state", {})
    new_state.update(state_update)

    mode_before = current.get("mode", "auto")
    mode_after = mode if mode else mode_before

    # Write new state
    db.actuator_states.update_one(
        {"_id": current["_id"]},
        {"$set": {
            "state": new_state,
            "mode": mode_after,
            "updated_at": now,
            "updated_by": operator_id
        }}
    )

    # Audit log
    db.control_commands.insert_one(tag(request, {
        "_id": str(uuid.uuid4()),
        "house_id": house_id,
        "device_type": device_type,
        "command": command,
        "payload": payload,
        "mode_before": mode_before,
        "mode_after": mode_after,
        "operator_id": operator_id,
        "operator_role": "operator",  # Ideally fetch from user details in auth
        "outcome": "success",
        "created_at": now
    }))

    # Broadcast via WebSocket
    await manager.broadcast({
        "type": "control_update",
        "farm_id": current.get("farm_id", "unknown"),
        "house_id": house_id,
        "device_type": device_type,
        "mode": mode_after,
        "state": new_state,
        "updated_by": operator_id,
        "timestamp": now
    })

    # NEW: Publish MQTT Command to Hardware
    if mqtt_client:
        try:
            mqtt_topic = f"commands/{house_id}/{device_type}"
            mqtt_payload = {
                "command": command,
                "state": new_state,
                "mode": mode_after,
                "timestamp": now
            }
            mqtt_client.publish(mqtt_topic, json.dumps(mqtt_payload))
            print(f"📡 MQTT: Published command to {mqtt_topic}")
        except Exception as e:
            print(f"❌ MQTT: Failed to publish command: {e}")

    return {
        "device_type": device_type,
        "mode": mode_after,
        "state": new_state,
        "updated_at": now,
        "updated_by": operator_id}


@router.post("/{house_id}/controls/{device_type}/mode")
async def update_device_mode(request: Request, 
    house_id: str,
    device_type: str,
    data: ModeUpdate,
    user: dict = Depends(
        require_auth())):
    if data.mode == "manual" and not data.reason:
        raise HTTPException(
            status_code=400,
            detail="Reason required when switching to manual")

    return await perform_actuator_update(request, house_id, device_type, {}, data.mode, data.operator_id, "set_mode", data.model_dump())


@router.patch("/{house_id}/controls/fans")
async def control_fans(request: Request, 
    house_id: str,
    data: FanControl,
    user: dict = Depends(
        require_auth())):
    return await perform_actuator_update(request, house_id, "fan", {"speed_percent": data.speed_percent, "running": data.speed_percent > 0}, None, data.operator_id, "set_speed", data.model_dump())


@router.post("/{house_id}/controls/fans/boost")
async def control_fans_boost(request: Request, 
    house_id: str,
    data: FanBoost,
    user: dict = Depends(
        require_auth())):
    return await perform_actuator_update(request, house_id, "fan", {"speed_percent": 100, "running": True}, "manual", data.operator_id, "boost", data.model_dump())


@router.patch("/{house_id}/controls/heater")
async def control_heater(request: Request, 
    house_id: str,
    data: HeaterControl,
    user: dict = Depends(
        require_auth())):
    return await perform_actuator_update(request, house_id, "heater", {"target_temp": data.target_temp}, None, data.operator_id, "set_target_temp", data.model_dump())


@router.post("/{house_id}/controls/heater/activate")
async def control_heater_activate(request: Request, 
    house_id: str,
    data: HeaterActivate,
    user: dict = Depends(
        require_auth())):
    return await perform_actuator_update(request, house_id, "heater", {"active": data.active}, None, data.operator_id, "activate", data.model_dump())


@router.post("/{house_id}/controls/feeder/trigger")
async def control_feeder_trigger(request: Request, 
    house_id: str,
    data: FeederTrigger,
    user: dict = Depends(
        require_auth())):
    now = datetime.utcnow().isoformat()
    return await perform_actuator_update(request, house_id, "feeder", {"last_fed": now, "portion_kg": data.portion_kg}, None, data.operator_id, "trigger_feed", data.model_dump())


@router.patch("/{house_id}/controls/feeder/schedule")
async def control_feeder_schedule(request: Request, 
    house_id: str,
    data: FeederSchedule,
    user: dict = Depends(
        require_auth())):
    return await perform_actuator_update(request, house_id, "feeder", {"schedule_times": data.times, "portion_kg": data.portion_kg}, None, data.operator_id, "set_schedule", data.model_dump())


@router.patch("/{house_id}/controls/lighting")
async def control_lighting(request: Request, 
    house_id: str,
    data: LightingControl,
    user: dict = Depends(
        require_auth())):
    return await perform_actuator_update(request, house_id, "lighting", {"brightness": data.brightness, "on_time": data.on_time, "off_time": data.off_time, "on": data.on}, None, data.operator_id, "set_lighting", data.model_dump())


@router.get('/{house_id}/sensors')
def get_house_sensors(request: Request, house_id: str, user=Depends(require_auth())):
    """
    Returns all sensor devices for a house with their latest telemetry reading.
    """
    sensor_types = ['temperature_humidity', 'ammonia', 'combined']
    devices = list(db.devices.find(scoped(request, {
        'house_id': house_id,
        '$or': [
            {'device_type': {'$in': sensor_types}},
            {'type': {'$in': sensor_types}}
        ]
    })))
    
    for device in devices:
        device['_id'] = str(device['_id'])
        # Handle cases where device_id field mignt be missing or stored in _id
        d_id = device.get('device_id') or device.get('_id')
        latest = db.telemetry.find_one(
            {'device_id': str(d_id)},
            sort=[('timestamp', -1)]
        )
        if latest:
            latest['_id'] = str(latest['_id'])
        device['latest_reading'] = latest
    return devices


@router.get('/{house_id}/actuators')
def get_house_actuators(request: Request, house_id: str, user=Depends(require_auth())):
    """
    Returns all actuator devices for a house with their current state.
    """
    actuator_types = ['actuator_fans', 'actuator_fan', 'actuator_heater', 'actuator_feeder',
                      'actuator_lighting', 'actuator_water']
    devices = list(db.devices.find(scoped(request, {
        'house_id': house_id,
        '$or': [
            {'device_type': {'$in': actuator_types}},
            {'type': {'$in': actuator_types}}
        ]
    })))
    
    for device in devices:
        device['_id'] = str(device['_id'])
        # Handle field naming variations safely
        raw_type = device.get('device_type') or device.get('type') or 'actuator_unknown'
        dt = raw_type.replace('actuator_', '')
        if dt == 'fans': dt = 'fan' # normalise

        state = db.actuator_states.find_one(scoped(request, {
            'house_id': house_id,
            'device_type': {'$in': [dt, dt+'s']}
        }))
        if state:
            state['_id'] = str(state['_id'])
        device['current_state'] = state
    return devices


@router.get('/{house_id}/environment')
def get_house_environment(
    house_id: str,
    request: Request,
    user=Depends(require_auth()),
):
    """
    Returns combined internal + external environment for a house.
    """
    # Readings are only stored on change or every 10 min (deadband + heartbeat),
    # so look back 15 min. Telemetry timestamps are BSON dates (older rows may be
    # ISO strings) and Mongo never matches a date against a string, so test both.
    cutoff = datetime.utcnow() - timedelta(minutes=15)
    recent = {'$or': [{'timestamp': {'$gte': cutoff}}, {'timestamp': {'$gte': cutoff.isoformat()}}]}

    pipeline = [
        {'$match': {'house_id': house_id, **recent}},
        {'$group': {
            '_id': None,
            'avg_temp': {'$avg': '$temperature'},
            'avg_humidity': {'$avg': '$humidity'},
            'avg_ammonia': {'$avg': '$ammonia'},
            'count': {'$sum': 1},
        }}
    ]
    internal_res = list(db.telemetry.aggregate(scoped_pipeline(request, pipeline)))
    internal = internal_res[0] if internal_res else {}

    zone_pipeline = [
        {'$match': {'house_id': house_id, **recent}},
        {'$sort': {'timestamp': -1}},
        {'$group': {
            '_id': '$device_id',
            'temp': {'$first': '$temperature'},
            'humidity': {'$first': '$humidity'},
            'ammonia': {'$first': '$ammonia'},
            'ts': {'$first': '$timestamp'},
        }}
    ]
    zones = list(db.telemetry.aggregate(scoped_pipeline(request, zone_pipeline)))

    try:
        house = db.houses.find_one(scoped(request, {'_id': ObjectId(house_id)}))
    except InvalidId:
        house = db.houses.find_one(scoped(request, {'_id': house_id}))
        
    if not house:
        house = {}
        
    external = house.get('external_conditions', {
        'temperature': None, 'humidity': None
    })

    actuators = list(db.actuator_states.find(scoped(request, {'house_id': house_id})))
    act_map = {a.get('device_type'): a for a in actuators}

    return {
        'house_id': house_id,
        'internal': {
            'avg_temperature': round(internal.get('avg_temp') or 0, 1) if internal.get('avg_temp') is not None else None,
            'avg_humidity': round(internal.get('avg_humidity') or 0, 1) if internal.get('avg_humidity') is not None else None,
            'avg_ammonia': round(internal.get('avg_ammonia') or 0, 1) if internal.get('avg_ammonia') is not None else None,
        },
        'external': external,
        'zones': [
            {
                'device_id': str(z['_id']) if z.get('_id') else None, 
                'temperature': round(z['temp'], 1) if z.get('temp') is not None else None,
                'humidity': round(z['humidity'], 1) if z.get('humidity') is not None else None
            } for z in zones
        ],
        'actuators': {
            'fans': act_map.get('fan', {}).get('state', {}),
            'heater': act_map.get('heater', {}).get('state', {}),
            'lighting': act_map.get('lighting', {}).get('state', {}),
            'feeder': act_map.get('feeder', {}).get('state', {}),
            'water': act_map.get('water', {}).get('state', {}),
        },
        'setpoints': {},
        'timestamp': datetime.utcnow().isoformat(),
    }

