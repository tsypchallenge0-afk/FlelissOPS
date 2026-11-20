from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import db

from fastapi import Request
from app.utils.tenant_query import scoped, tag, scoped_pipeline
from app.utils.quota import check_quota
from app.auth.dependencies import require_auth
from datetime import datetime
from bson.objectid import ObjectId
from typing import Optional
import traceback
from app.websocket.manager import manager
import uuid

router = APIRouter(prefix="/flocks", tags=["Flocks"], redirect_slashes=False)

# Helper for converting DB docs
def to_dict(doc):
    if not doc: return None
    doc["id"] = str(doc.pop("_id", ""))
    return doc

@router.get("")
def get_flocks(request: Request, status: Optional[str] = None, houseId: Optional[str] = None, farmId: Optional[str] = None, user=Depends(require_auth())):
    query = {}
    if status:
        query["status"] = status
    if houseId:
        query["house_id"] = houseId
    if farmId:
        query["farm_id"] = farmId
        
    cursor = db.flocks.find(scoped(request, query)).sort("created_at", -1)
    return [to_dict(c) for c in cursor]


@router.post("")
def create_flock(request: Request, data: dict, user=Depends(require_auth(["supervisor", "admin", "operator"]))):
    now = datetime.utcnow()
    
    # Auto-lookup farm_id from house
    house_id = data.get("house_id")
    house = None
    try:
        house = db.houses.find_one(scoped(request, {"_id": ObjectId(house_id)}))
    except Exception:
        pass
    if not house:
        house = db.houses.find_one(scoped(request, {"_id": house_id}))
    farm_id = house.get("farm_id", "FARM-1") if house else "FARM-1"

    flock_id = data.get("flock_id")
    if not flock_id:
        house_code = (house.get("house_code") if house else str(house_id)[-4:])
        year = now.strftime("%Y")
        count = db.flocks.count_documents(scoped(request, {"house_id": house_id})) + 1
        flock_id = f"FLOCK-{year}-{house_code}-{count:02d}"

    flock = {
        "house_id": house_id,
        "farm_id": farm_id,
        "flock_id": flock_id,
        "breed": data.get("breed", "Ross 308"),
        "placement_date": data.get("placement_date", now.isoformat()),
        "placement_count": int(data.get("placement_count", 0)),
        "target_weight_g": float(data.get("target_weight_g", 2500)),
        "target_age_days": int(data.get("target_age_days", 42)),
        "status": "active",
        "created_by": user.get("id", user.get("_id", "unknown")),
        "created_at": now.isoformat()
    }
    
    # Check string vs date object based on payload
    pd = data.get("placement_date")
    if pd and "T" not in pd:
        flock["placement_date"] = f"{pd}T00:00:00Z"
        
    result = db.flocks.insert_one(tag(request, flock))
    flock["_id"] = result.inserted_id
    return to_dict(flock)


def _get_flock_raw(request: Request, id: str):
    """Internal helper to get raw flock document."""
    query = {"_id": id}
    if len(id) == 24:
        try: query = {"_id": ObjectId(id)}
        except: pass
            
    flock = db.flocks.find_one(scoped(request, query))
    if not flock:
        flock = db.flocks.find_one(scoped(request, {"flock_id": id}))
    if not flock:
        raise HTTPException(404, "Flock not found")
    return flock

@router.get("/{id}")
def get_flock(request: Request, id: str, user=Depends(require_auth())):
    return to_dict(_get_flock_raw(request, id))


@router.patch("/{id}")
def update_flock(request: Request, id: str, data: dict, user=Depends(require_auth(["supervisor", "admin"]))):
    query = {"_id": id}
    if len(id) == 24:
        try: query = {"_id": ObjectId(id)}
        except: pass
        
    db.flocks.update_one(scoped(request, query), {"$set": data})
    return to_dict(_get_flock_raw(request, id))


# entries
@router.get("/{id}/entries")
def get_entries(request: Request, id: str, user=Depends(require_auth())):
    flock = _get_flock_raw(request, id)
    entries = list(db.flock_entries.find(scoped(request, {"flock_id": str(flock["_id"])})).sort("day", 1))
    return [to_dict(e) for e in entries]


@router.post("/{id}/entries")
def create_entry(request: Request, id: str, data: dict, user=Depends(require_auth())):
    flock = _get_flock_raw(request, id)
    
    # Determine day based on flock placement_date
    placement_date = flock.get("placement_date")
    try:
        if isinstance(placement_date, str):
            pd = datetime.fromisoformat(placement_date.replace("Z", "+00:00")).replace(tzinfo=None)
        else:
            pd = placement_date
        day = max(0, (datetime.utcnow() - pd).days)
    except:
        day = 0
        
    entry = {
        "flock_id": str(flock["_id"]),
        "house_id": flock.get("house_id"),
        "entry_type": data.get("entry_type"),
        "day": data.get("day", day),
        "recorded_at": datetime.utcnow().isoformat(),
        "value": float(data.get("value", 0)),
        "sample_size": int(data.get("sample_size", 1)),
        "notes": data.get("notes", ""),
        "recorded_by": user.get("id", "unknown")
    }
    
    result = db.flock_entries.insert_one(tag(request, entry))
    entry["_id"] = result.inserted_id
    return to_dict(entry)


# mortality
@router.get("/{id}/mortality")
def get_mortality(request: Request, id: str, user=Depends(require_auth())):
    flock = _get_flock_raw(request, id)
    entries = list(db.mortality_events.find(scoped(request, {"flock_id": str(flock["_id"])})).sort("detected_at", -1))
    return [to_dict(e) for e in entries]


@router.post("/{id}/mortality")
def create_mortality(request: Request, id: str, data: dict, user=Depends(require_auth())):
    flock = _get_flock_raw(request, id)
    
    placement_date = flock.get("placement_date")
    try:
        if isinstance(placement_date, str):
            pd = datetime.fromisoformat(placement_date.replace("Z", "+00:00")).replace(tzinfo=None)
        else:
            pd = placement_date
        day = max(0, (datetime.utcnow() - pd).days)
    except:
        day = 0
        
    entry = {
        "flock_id": str(flock["_id"]),
        "house_id": flock.get("house_id"),
        "detected_at": datetime.utcnow().isoformat(),
        "day": data.get("day", day),
        "count": int(data.get("count", 1)),
        "source": data.get("source", "manual"),
        "confidence": data.get("confidence", 1.0),
        "acknowledged": True if data.get("source") == "manual" else False,
        "notes": data.get("notes", ""),
        "acknowledged_by": user.get("id") if data.get("source") == "manual" else None
    }
    
    result = db.mortality_events.insert_one(tag(request, entry))
    entry["_id"] = result.inserted_id
    
    # --- Real-time Anomaly Detection: Mortality Spike ---
    placement_count = flock.get("placement_count", 0)
    mortality_count = entry["count"]
    if placement_count > 0:
        mortality_pct = (mortality_count / placement_count) * 100
        if mortality_pct > 0.5:
            import asyncio
            alert = {
                "_id": str(uuid.uuid4()),
                "tenant_id": getattr(request.state, 'tenant_id', None) or flock.get("tenant_id"),
                "house_id": flock.get("house_id"),
                "metric": "mortality",
                "type": "mortality_spike",
                "severity": "critical",
                "message": f"Mortality Spike: {mortality_count} birds died ({mortality_pct:.2f}% of flock) in a single log.",
                "value": mortality_count,
                "status": "active",
                "timestamp": datetime.utcnow().isoformat()
            }
            db.alerts.insert_one(alert)
            alert["id"] = alert.pop("_id")
            
            # Broadcast alert to UI
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(manager.broadcast({
                    "type": "alert",
                    "alerts": [alert]
                }))
            except RuntimeError:
                pass # If no running loop, ignore broadcast

    return to_dict(entry)


@router.patch("/{flock_id}/mortality/{m_id}")
def ack_mortality(request: Request, flock_id: str, m_id: str, data: dict, user=Depends(require_auth())):
    query = {"_id": ObjectId(m_id)} if len(m_id) == 24 else {"_id": m_id}
    db.mortality_events.update_one(query, {"$set": {
        "acknowledged": data.get("acknowledged", True),
        "acknowledged_by": user.get("id", "unknown")
    }})
    return {"status": "success"}


# KPIs
@router.get("/{id}/kpis")
def get_kpis(request: Request, id: str, user=Depends(require_auth())):
    flock = _get_flock_raw(request, id)
        
    flock_id = str(flock["_id"])
    entries = list(db.flock_entries.find(scoped(request, {"flock_id": flock_id})))
    mortality = list(db.mortality_events.find(scoped(request, {"flock_id": flock_id})))
    
    from app.flock.kpis import compute_kpis
    try:
        return compute_kpis(flock, entries, mortality)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"KPI Computation failed: {str(e)}")

@router.get("/{id}/correlation")
def get_correlation(request: Request, id: str, user=Depends(require_auth())):
    # Stub for future correlation
    return {"status": "not_implemented"}
