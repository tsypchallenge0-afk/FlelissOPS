from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument
from app.database import db

from fastapi import Request
from app.utils.tenant_query import scoped, tag, scoped_pipeline
from app.utils.quota import check_quota
from app.schemas.farm_schema import FarmCreate, FarmUpdate, FarmOut, FarmAggregateOut
from app.auth.dependencies import require_auth
from datetime import datetime, timedelta
import uuid
from bson.objectid import ObjectId
from bson.errors import InvalidId

router = APIRouter(
    prefix="/farms",
    tags=["Farms"],
    redirect_slashes=False
)


@router.get("", response_model=list[FarmAggregateOut])
def get_farms(request: Request, user: dict = Depends(require_auth())):
    farms = list(db.farms.find(scoped(request)))
    results = []

    # Pre-fetch rules for risk calculation
    # Pre-fetch rules for risk calculation

    for f in farms:
        farm_id = str(f["_id"])
        houses = list(db.houses.find(scoped(request, {"farm_id": farm_id})))
        house_ids = [str(h["_id"]) for h in houses]

        devices = list(db.devices.find(scoped(request, {"house_id": {"$in": house_ids}})))
        device_ids = [str(d["_id"]) for d in devices]

        in_farm = {"$or": [{"house_id": {"$in": house_ids}}, {"device_id": {"$in": device_ids}}]}
        active_alerts = db.alerts.count_documents({**in_farm, "status": "active"})

        # Latest reading per sensor (or per house for house-level simulators) within the last hour.
        # Timestamps are BSON dates (older rows: ISO strings), so match both.
        since = datetime.utcnow() - timedelta(hours=1)
        recent = {"$or": [{"timestamp": {"$gte": since}}, {"timestamp": {"$gte": since.isoformat()}}]}
        pipeline = [
            {"$match": {"$and": [in_farm, recent]}},
            {"$sort": {"timestamp": -1}},
            {"$group": {
                "_id": {"$ifNull": ["$device_id", "$house_id"]},
                "temperature": {"$first": "$temperature"},
                "humidity": {"$first": "$humidity"},
                "ammonia": {"$first": "$ammonia"}
            }}
        ]
        latest_telemetry = list(db.telemetry.aggregate(scoped_pipeline(request, pipeline)))

        # None (not 0) when there is no recent data, so the UI can show "—" instead of fake zeros
        def _vals(key):
            return [t[key] for t in latest_telemetry if t.get(key) is not None]
        temps, hums, amms = _vals("temperature"), _vals("humidity"), _vals("ammonia")
        r1 = lambda v: round(v, 1) if v is not None else None
        temp_min, temp_max = (min(temps), max(temps)) if temps else (None, None)
        hum_min, hum_max = (min(hums), max(hums)) if hums else (None, None)
        amm_peak = max(amms) if amms else None

        risk_level = "LOW"
        if active_alerts > 0:
            risk_level = "MEDIUM"
        if active_alerts >= 5 or (temp_max or 0) > 33 or (amm_peak or 0) > 25:
            risk_level = "HIGH"

        results.append(FarmAggregateOut(
            id=farm_id,
            name=f.get("name", ""),
            location=f.get("location", ""),
            house_count=len(houses),
            created_at=f.get("created_at", ""),
            updated_at=f.get("updated_at", ""),
            device_count=len(devices),
            risk_level=risk_level,
            active_alert_count=active_alerts,
            temp_min=r1(temp_min),
            temp_max=r1(temp_max),
            humidity_min=r1(hum_min),
            humidity_max=r1(hum_max),
            ammonia_peak=r1(amm_peak)
        ))
    return results


from bson.objectid import ObjectId, InvalidId

@router.get("/{farm_id}", response_model=FarmOut)
def get_farm(request: Request, farm_id: str, user: dict = Depends(require_auth())):
    f = None
    try:
        f = db.farms.find_one(scoped(request, {"_id": ObjectId(farm_id)}))
    except InvalidId:
        pass
    
    if not f:
        f = db.farms.find_one(scoped(request, {"_id": farm_id}))

    if not f:
        raise HTTPException(status_code=404, detail="Farm not found")
    return FarmOut(
        id=str(f["_id"]),
        name=f.get("name"),
        location=f.get("location"),
        house_count=f.get(
            "house_count",
            0),
        created_at=f.get("created_at"),
        updated_at=f.get("updated_at"))


@router.post("", response_model=FarmOut)
def create_farm(request: Request, 
    farm: FarmCreate,
    user: dict = Depends(
        require_auth(
            ["supervisor", "admin"]))):
    check_quota(request, 'farm')
    farm_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    farm_data = {
        "_id": farm_id,
        "name": farm.name,
        "location": farm.location,
        "house_count": 0,
        "created_at": now,
        "updated_at": now
    }
    db.farms.insert_one(tag(request, farm_data))
    return FarmOut(id=farm_id, **farm_data)


@router.patch("/{farm_id}", response_model=FarmOut)
def update_farm(request: Request, 
    farm_id: str,
    farm: FarmUpdate,
    user: dict = Depends(
        require_auth(
            ["admin"]))):
    update_data = {k: v for k, v in farm.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    result = db.farms.find_one_and_update(
        {"_id": farm_id}, {"$set": update_data}, return_document=ReturnDocument.AFTER)
    if not result:
        raise HTTPException(status_code=404, detail="Farm not found")
    return FarmOut(id=str(result["_id"]), **result)


@router.get("/{farm_id}/houses")
def get_farm_houses(request: Request, farm_id: str, user: dict = Depends(require_auth())):
    houses = []
    try:
        houses = list(db.houses.find(scoped(request, {"farm_id": ObjectId(farm_id)})))
    except InvalidId:
        pass

    if not houses:
        houses = list(db.houses.find(scoped(request, {"farm_id": farm_id})))
    for h in houses:
        h["id"] = str(h.pop("_id"))
        # attach live actuator state
        h["actuator_states"] = list(db.actuator_states.find(
            {"house_id": h["id"]}, {"_id": 0}))
    return houses


@router.post("/{farm_id}/houses")
def create_house(request: Request, 
    farm_id: str,
    house: dict,  # Using dict for flexibility or you can import HouseCreate from schemas
    user: dict = Depends(require_auth(["supervisor", "admin"]))
):
    check_quota(request, 'house')
    from app.schemas.house_schema import HouseCreate, HouseOut
    # Validate payload
    try:
        # farm_id comes from the URL; ignore any copy in the body instead of failing
        body = {k: v for k, v in house.items() if k != 'farm_id'}
        house_data = HouseCreate(farm_id=farm_id, **body).model_dump()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    house_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    
    house_doc = {
        "_id": house_id,
        **house_data,
        "created_at": now,
        "updated_at": now
    }
    
    db.houses.insert_one(tag(request, house_doc))
    
    # Increment house count in farm
    db.farms.update_one(
        {"_id": farm_id},
        {"$inc": {"house_count": 1}, "$set": {"updated_at": now}}
    )
    
    return HouseOut(id=house_id, **house_doc)


@router.get("/{farm_id}/alerts")
def get_farm_alerts(request: Request, farm_id: str, user: dict = Depends(require_auth())):
    houses = []
    try:
        houses = list(db.houses.find(scoped(request, {"farm_id": ObjectId(farm_id)}), {"_id": 1, "house_code": 1}))
    except InvalidId:
        pass

    if not houses:
        houses = list(db.houses.find(scoped(request, {"farm_id": farm_id}), {"_id": 1, "house_code": 1}))
    
    house_map = {str(h["_id"]): h.get("house_code", "") for h in houses}
    house_ids = list(house_map.keys())
    
    devices = list(db.devices.find(
        {"house_id": {"$in": house_ids}}, {"_id": 1, "house_id": 1}))
    
    device_to_house = {str(d["_id"]): str(d["house_id"]) for d in devices}
    device_ids = list(device_to_house.keys())
    
    query = {"device_id": {"$in": device_ids}, "status": "active"}
    alerts = list(db.alerts.find(scoped(request, query)))
    for a in alerts:
        a["id"] = str(a.pop("_id"))
        h_id = device_to_house.get(a.get("device_id", ""))
        if h_id:
            a["house_code"] = house_map.get(h_id, "")
            
    return alerts


@router.get("/{farm_id}/controls")
def get_farm_controls(request: Request, farm_id: str, user: dict = Depends(require_auth())):
    houses = []
    try:
        houses = list(db.houses.find(scoped(request, {"farm_id": ObjectId(farm_id)}), {"_id": 1}))
    except InvalidId:
        pass

    if not houses:
        houses = list(db.houses.find(scoped(request, {"farm_id": farm_id}), {"_id": 1}))
    house_ids = [str(h["_id"]) for h in houses]
    controls = list(db.actuator_states.find(scoped(request, {"house_id": {"$in": house_ids}})))
    for c in controls:
        c["id"] = str(c.pop("_id"))
    return controls


@router.patch("/{farm_id}/controls")
def update_farm_controls(request: Request, farm_id: str, payload: dict, user: dict = Depends(
        require_auth(["supervisor", "admin"]))):
    # Applies a control update to all houses in a farm
    # Applies a control update to all houses in a farm
    # simplified logic for now
    return {"message": "Farm controls updated"}


@router.post("/{farm_id}/controls/emergency-cooling")
def farm_emergency_cooling(request: Request, farm_id: str, payload: dict, user: dict = Depends(
        require_auth(["supervisor", "admin"]))):
    return {"message": "Emergency cooling activated"}
