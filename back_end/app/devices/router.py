from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timedelta, timezone
from app.database import db

from fastapi import Request
from app.utils.tenant_query import scoped, tag, scoped_pipeline, find_device
from app.utils.quota import check_quota
from app.schemas.device_schema import DeviceCreate, DeviceOut
from app.auth.dependencies import require_auth
from app.websocket.manager import manager

router = APIRouter(
    prefix="/devices",
    tags=["Devices"]
)


@router.post("", response_model=DeviceOut)
@router.post("/register", response_model=DeviceOut)
def register_device(request: Request, 
    data: dict,
    user: dict = Depends(
        require_auth(
            ["supervisor", "admin"]))) -> DeviceOut:
    check_quota(request, 'device')
    # Payload mapping for frontend compatibility
    # Frontend might send device_type instead of type, and might omit name
    device_type = data.get("device_type") or data.get("type") or "sensor"
    device_name = data.get("name") or f"{device_type.replace('_', ' ').title()} Node"
    
    device_dict = {
        "house_id": data.get("house_id"),
        "name": device_name,
        "type": device_type,
        "status": data.get("status") or "online",
        "model": data.get("model") or data.get("firmware") or "SENSOR-NODE",
        "position": data.get("position") or "Middle-Center",
        "x_coord": data.get("x_coord"),
        "y_coord": data.get("y_coord"),
        "last_seen": None
    }
    
    # Allow custom ID (e.g. for discovered devices)
    custom_id = data.get("device_id") or data.get("id")
    if custom_id:
        device_dict["_id"] = custom_id

    # Validate against schema if needed
    from app.schemas.device_schema import DeviceCreate
    try:
        # Schema validation (without _id)
        DeviceCreate(**{k:v for k,v in device_dict.items() if k != "_id"})
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = db.devices.insert_one(tag(request, device_dict))
    
    # Cleanup from discovery if it was there
    if custom_id:
        db.discovered_devices.delete_one({"device_id": custom_id})
    
    # If it was an auto-gen ID, add it to response
    inserted_id = str(result.inserted_id) if result.acknowledged else custom_id
    return DeviceOut(id=inserted_id, **{k:v for k,v in device_dict.items() if k != "_id"})


# A sensor that has not reported within this window is shown as offline. The stored
# 'status' is only ever set to "online" by telemetry, so it cannot go stale on its own.
SENSOR_OFFLINE_AFTER = timedelta(minutes=15)
_STICKY_STATUSES = {"maintenance", "rebooting", "updating"}


def effective_status(device: dict) -> str:
    stored = device.get("status") or "online"
    dtype = str(device.get("type") or device.get("device_type") or "")
    if stored in _STICKY_STATUSES or dtype.startswith("actuator"):
        return stored   # actuators don't send telemetry heartbeats
    last_seen = device.get("last_seen")
    if isinstance(last_seen, str):
        try:
            last_seen = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
        except ValueError:
            last_seen = None
    if not isinstance(last_seen, datetime):
        return "offline"
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    return "online" if datetime.now(timezone.utc) - last_seen < SENSOR_OFFLINE_AFTER else "offline"


@router.get("", response_model=list[DeviceOut])
def get_devices(request: Request, user: dict = Depends(require_auth())) -> list[DeviceOut]:
    devices_cursor = list(db.devices.find(scoped(request)))
    results = []
    for device in devices_cursor:
        house_id = str(device.get("house_id", ""))
        house_code = ""
        farm_id = ""
        farm_name = ""
        if house_id:
            from bson.objectid import ObjectId
            try:
                house = db.houses.find_one(scoped(request, {"_id": ObjectId(house_id)})) or db.houses.find_one(scoped(request, {"_id": house_id}))
                if house:
                    house_code = house.get("house_code", "")
                    farm_id = str(house.get("farm_id", ""))
                    if farm_id:
                        farm = db.farms.find_one(scoped(request, {"_id": ObjectId(farm_id)})) or db.farms.find_one(scoped(request, {"_id": farm_id}))
                        if farm:
                            farm_name = farm.get("name", "")
            except:
                house = db.houses.find_one(scoped(request, {"_id": house_id}))
                if house:
                    house_code = house.get("house_code", "")
                    farm_id = str(house.get("farm_id", ""))
                    if farm_id:
                        farm = db.farms.find_one(scoped(request, {"_id": farm_id}))
                        if farm:
                            farm_name = farm.get("name", "")

        results.append(DeviceOut(
            id=str(device["_id"]),
            house_id=house_id,
            house_code=house_code,
            farm_id=farm_id,
            farm_name=farm_name,
            name=device.get("name") or "DEVICE",
            type=device.get("type") or "sensor",
            status=effective_status(device),
            model=device.get("model") or "SENSOR-NODE",
            position=device.get("position") or "Middle-Center",
            x_coord=device.get("x_coord"),
            y_coord=device.get("y_coord"),
            last_seen=device.get("last_seen"),
        ))
    return results


@router.get("/discovered")
def get_discovered_devices(request: Request, user: dict = Depends(require_auth())):
    """
    Returns a list of devices that have sent MQTT data but are not yet registered.
    """
    discovered = list(db.discovered_devices.find().sort("last_seen", -1))
    for d in discovered:
        d["_id"] = str(d["_id"])
        if d.get("last_seen"):
             d["last_seen"] = d["last_seen"].isoformat()
    return discovered

@router.get("/{device_id}", response_model=DeviceOut)
def get_device(request: Request, device_id: str, user: dict = Depends(require_auth())):
    from bson.objectid import ObjectId
    q = {"_id": device_id}
    if len(device_id) == 24:
        q = {"_id": ObjectId(device_id)}

    device = db.devices.find_one(scoped(request, q))
    if not device:
        # Fallback to check string ID if it failed with ObjectId
        device = db.devices.find_one(scoped(request, {"_id": device_id}))

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    house_id = str(device.get("house_id", ""))
    house_code = ""
    farm_id = ""
    farm_name = ""
    if house_id:
        try:
            house = db.houses.find_one(scoped(request, {"_id": ObjectId(house_id)})) or db.houses.find_one(scoped(request, {"_id": house_id}))
            if house:
                house_code = house.get("house_code", "")
                farm_id = str(house.get("farm_id", ""))
                if farm_id:
                    farm = db.farms.find_one(scoped(request, {"_id": ObjectId(farm_id)})) or db.farms.find_one(scoped(request, {"_id": farm_id}))
                    if farm:
                        farm_name = farm.get("name", "")
        except:
            house = db.houses.find_one(scoped(request, {"_id": house_id}))
            if house:
                house_code = house.get("house_code", "")
                farm_id = str(house.get("farm_id", ""))
                if farm_id:
                    farm = db.farms.find_one(scoped(request, {"_id": farm_id}))
                    if farm:
                        farm_name = farm.get("name", "")

    return DeviceOut(
        id=str(device["_id"]),
        house_id=house_id,
        house_code=house_code,
        farm_id=farm_id,
        farm_name=farm_name,
        name=device.get("name") or "DEVICE",
        type=device.get("type") or "sensor",
        status=effective_status(device),
        model=device.get("model") or "SENSOR-NODE",
        position=device.get("position") or "Middle-Center",
        x_coord=device.get("x_coord"),
        y_coord=device.get("y_coord"),
        last_seen=device.get("last_seen"),
    )


@router.patch("/{device_id}")
def update_device(request: Request, device_id: str, data: dict, user: dict = Depends(
        require_auth(["supervisor", "admin"]))):
    # Device _ids are a mix of plain strings and ObjectIds — try both.
    device = find_device(device_id)
    tenant_id = getattr(request.state, "tenant_id", None)
    if not device or (tenant_id and device.get("tenant_id") != tenant_id):
        raise HTTPException(status_code=404, detail="Device not found")
    q = {"_id": device["_id"]}

    update_data = {}
    if "status" in data:
        update_data["status"] = data["status"]
    if "position" in data:
        update_data["position"] = data["position"]
    if "x_coord" in data:
        update_data["x_coord"] = data["x_coord"]
    if "y_coord" in data:
        update_data["y_coord"] = data["y_coord"]

    if update_data:
        db.devices.update_one(q, {"$set": update_data})
    return {"message": "Device updated"}


@router.post("/{device_id}/reboot")
async def reboot_device(request: Request, device_id: str, data: dict, user: dict = Depends(
        require_auth(["supervisor", "admin"]))):
    from bson.objectid import ObjectId
    q = {"_id": device_id} if len(device_id) != 24 else {
        "_id": ObjectId(device_id)}

    db.devices.update_one(q, {"$set": {"status": "rebooting"}})
    await manager.broadcast({
        "type": "device_status",
        "device_id": device_id,
        "status": "rebooting",
        "initiated_by": data.get("initiated_by", user["username"])
    })
    return {"message": "Reboot initiated"}


@router.post("/{device_id}/firmware/update")
async def update_firmware(request: Request, 
    device_id: str,
    data: dict,
    user: dict = Depends(
        require_auth(
            ["admin"]))):
    return {"message": "Firmware update initiated"}


@router.delete("/{device_id}")
def delete_device(request: Request, device_id: str, user: dict = Depends(
        require_auth(["supervisor", "admin"]))):
    from bson.objectid import ObjectId
    q = {"_id": device_id} if len(device_id) != 24 else {
        "_id": ObjectId(device_id)}
    
    # Verify device exists and belongs to tenant
    device = db.devices.find_one(scoped(request, q)) or db.devices.find_one(scoped(request, {"_id": device_id}))
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
        
    db.devices.delete_one(q)
    return {"message": "Device deleted successfully"}


@router.get("/{device_id}/history")
def get_device_history(request: Request, 
    device_id: str,
    minutes: Optional[int] = Query(60, ge=1, le=1440),
    user: dict = Depends(require_auth()),
):
    from bson.objectid import ObjectId
    from datetime import datetime, timezone, timedelta

    q = {"_id": device_id} if len(device_id) != 24 else {
        "_id": ObjectId(device_id)}
    device = db.devices.find_one(scoped(request, q)) or db.devices.find_one(scoped(request, {"_id": device_id}))
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    telemetry_query = {
        "device_id": device.get("_id") if isinstance(device.get("_id"), str) else str(device.get("_id")),
        "timestamp": {"$gte": since},
    }

    history = list(db.telemetry.find(scoped(request, telemetry_query)).sort("timestamp", -1).limit(200))

    for h in history:
        h["_id"] = str(h["_id"])

    return history


@router.get("/{device_id}/check")
def check_device_connectivity(request: Request, device_id: str, user: dict = Depends(require_auth())):
    """
    Checks if the device has sent data recently (within 2 minutes).
    """
    from bson.objectid import ObjectId
    from datetime import datetime, timezone, timedelta

    q = {"_id": device_id} if len(device_id) != 24 else {
        "_id": ObjectId(device_id)}
    device = db.devices.find_one(scoped(request, q)) or db.devices.find_one(scoped(request, {"_id": device_id}))
    
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    last_seen = device.get("last_seen")
    if not last_seen:
        return {"status": "offline", "message": "Never seen", "last_seen": None}

    # Handle naive/aware datetime comparison
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    is_online = (now - last_seen) < timedelta(minutes=2)

    return {
        "status": "online" if is_online else "offline",
        "last_seen": last_seen.isoformat(),
        "seconds_since_last_seen": int((now - last_seen).total_seconds())
    }
