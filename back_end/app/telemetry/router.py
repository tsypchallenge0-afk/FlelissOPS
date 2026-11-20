from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.auth.dependencies import require_auth

from fastapi import Request
from app.utils.tenant_query import scoped, tag, scoped_pipeline, resolve_telemetry_context
from app.utils.quota import check_quota
import uuid
from app.database import db
from app.websocket.manager import manager
from datetime import datetime, timezone, timedelta
from app.schemas.telemetry_schema import TelemetryCreate, TelemetryAnalytics, TelemetryIngest

# Cache for real-time anomaly detection: device_id -> metric -> list of recent dicts
sensor_history_cache = {}

# Cache for storage optimization: device_id -> last_stored_doc
last_saved_cache = {}

# Optimization Thresholds (User requested "less sensitive")
THRESHOLDS = {
    "temperature": 0.5,
    "humidity": 2.0,
    "ammonia": 1.0
}
HEARTBEAT_SECONDS = 600 # 10 minutes


router = APIRouter(prefix="/telemetry", tags=["Telemetry"])


def should_save_telemetry(device_id: str, current_doc: dict) -> bool:
    """
    Returns True if the telemetry should be saved to DB based on:
    1. Significant change (Deadband)
    2. Time elapsed since last save (Heartbeat)
    """
    last_saved = last_saved_cache.get(device_id)
    if not last_saved:
        return True # Always save the first one
        
    now = datetime.now(timezone.utc)
    last_time = last_saved.get("timestamp")
    
    # Ensure last_time is a datetime object
    if isinstance(last_time, str):
        last_time = datetime.fromisoformat(last_time.replace("Z", "+00:00"))
    
    # 1. Heartbeat check
    if (now - last_time).total_seconds() >= HEARTBEAT_SECONDS:
        return True
        
    # 2. Deadband check
    for metric, threshold in THRESHOLDS.items():
        curr_val = current_doc.get(metric)
        last_val = last_saved.get(metric)
        
        if curr_val is not None and last_val is not None:
            if abs(curr_val - last_val) >= threshold:
                return True
                
    return False


async def evaluate_alerts(request: Optional[Request], device_id, telemetry_data, tenant_id: Optional[str] = None):
    alerts = []
    
    # Get IDs for tagging
    t_id = tenant_id or (getattr(request.state, 'tenant_id', None) if request else telemetry_data.get("tenant_id"))
    house_id = telemetry_data.get("house_id")

    # Find rules for this tenant (or global rules)
    rules_query = {"enabled": True}
    if t_id:
        rules_query["$or"] = [{"tenant_id": t_id}, {"scope": "global"}]
    else:
        rules_query["scope"] = "global"
        
    rules = list(db.alert_rules.find(rules_query))

    def check_metric(metric_name, value):
        if value is None: return
        
        # Priority: tenant-specific rule, then global rule
        applicable_rule = next((r for r in rules if r["metric"] == metric_name and r.get("tenant_id") == t_id), None)
        if not applicable_rule:
            applicable_rule = next((r for r in rules if r["metric"] == metric_name and r.get("scope") == "global"), None)
            
        if not applicable_rule:
            return

        if value > applicable_rule["danger_threshold"]:
            alerts.append({
                "_id": str(uuid.uuid4()),
                "tenant_id": t_id,
                "house_id": house_id,
                "device_id": device_id,
                "metric": metric_name,
                "type": f"{metric_name}_danger",
                "severity": "danger",
                "message": f"{metric_name.capitalize()} dangerously high",
                "value": value,
                "threshold": applicable_rule["danger_threshold"],
                "status": "active",
                "timestamp": datetime.utcnow().isoformat()
            })
        elif value > applicable_rule["warn_threshold"]:
            alerts.append({
                "_id": str(uuid.uuid4()),
                "tenant_id": t_id,
                "house_id": house_id,
                "device_id": device_id,
                "metric": metric_name,
                "type": f"{metric_name}_warning",
                "severity": "warning",
                "message": f"{metric_name.capitalize()} high",
                "value": value,
                "threshold": applicable_rule["warn_threshold"],
                "status": "active",
                "timestamp": datetime.utcnow().isoformat()
            })

    # Cache for anomaly detection
    device_cache = sensor_history_cache.setdefault(device_id, {})

    def check_anomaly(metric_name, value):
        if value is None: return
        
        # 1. Out of bounds check
        bounds = {"temperature": (-10, 60), "humidity": (0, 100), "ammonia": (0, 500)}
        if metric_name in bounds:
            min_val, max_val = bounds[metric_name]
            if value < min_val or value > max_val:
                alerts.append({
                    "_id": str(uuid.uuid4()),
                    "tenant_id": t_id,
                    "house_id": house_id,
                    "device_id": device_id,
                    "metric": metric_name,
                    "type": "sensor_failure",
                    "severity": "critical",
                    "message": f"Sensor Failure: {metric_name.capitalize()} reading ({value}) is out of physical bounds.",
                    "value": value,
                    "status": "active",
                    "timestamp": datetime.utcnow().isoformat()
                })
                return # Don't process stuck/roc if it's an absurd value

        # 2. History updates
        history = device_cache.setdefault(metric_name, [])
        history.append({"value": value, "timestamp": datetime.utcnow()})
        
        # Keep last 10 readings (approx 5 mins if pinging every 30s)
        if len(history) > 10:
            history.pop(0)
            
        # 3. Stuck Sensor check (5 identical readings)
        if len(history) >= 5:
            last_5 = [h["value"] for h in history[-5:]]
            if len(set(last_5)) == 1:
                alerts.append({
                    "_id": str(uuid.uuid4()),
                    "tenant_id": t_id,
                    "house_id": house_id,
                    "device_id": device_id,
                    "metric": metric_name,
                    "type": "sensor_stuck",
                    "severity": "warning",
                    "message": f"Sensor Stuck: {metric_name.capitalize()} has read exactly {value} for 5 consecutive readings.",
                    "value": value,
                    "status": "active",
                    "timestamp": datetime.utcnow().isoformat()
                })
                
        # 4. Rate of Change (RoC) check (compare with oldest in history)
        if len(history) >= 5:
            oldest = history[0]
            time_diff = (datetime.utcnow() - oldest["timestamp"]).total_seconds() / 60.0
            if time_diff > 0:
                roc = abs(value - oldest["value"]) / time_diff
                roc_thresholds = {"temperature": 1.0, "humidity": 10.0, "ammonia": 10.0} # max change per minute
                if metric_name in roc_thresholds and roc > roc_thresholds[metric_name]:
                    alerts.append({
                        "_id": str(uuid.uuid4()),
                        "tenant_id": t_id,
                        "house_id": house_id,
                        "device_id": device_id,
                        "metric": metric_name,
                        "type": "rapid_change",
                        "severity": "danger",
                        "message": f"Rapid Change: {metric_name.capitalize()} changed by {abs(value - oldest['value']):.1f} in {time_diff:.1f} mins.",
                        "value": value,
                        "status": "active",
                        "timestamp": datetime.utcnow().isoformat()
                    })

    check_metric("temperature", telemetry_data.get("temperature"))
    check_metric("humidity", telemetry_data.get("humidity"))
    check_metric("ammonia", telemetry_data.get("ammonia"))
    
    check_anomaly("temperature", telemetry_data.get("temperature"))
    check_anomaly("humidity", telemetry_data.get("humidity"))
    check_anomaly("ammonia", telemetry_data.get("ammonia"))

    # De-duplicate: a condition that persists must not create a new alert per reading.
    # An open alert of the same type on the same device (last 6 h) absorbs the occurrence;
    # a silenced one suppresses it. Resolved alerts allow a fresh alert to be raised.
    now_dt = datetime.utcnow()
    open_since = (now_dt - timedelta(hours=6)).isoformat()
    fresh = []
    for a in alerts:
        existing = db.alerts.find_one({
            "device_id": device_id, "type": a["type"],
            "status": {"$in": ["active", "acknowledged"]},
            "timestamp": {"$gte": open_since},
        }, sort=[("timestamp", -1)])
        if existing:
            db.alerts.update_one({"_id": existing["_id"]}, {
                "$set": {"value": a.get("value"), "last_seen_at": a["timestamp"]},
                "$inc": {"occurrences": 1},
            })
            continue
        silenced = db.alerts.find_one({"device_id": device_id, "type": a["type"],
                                       "silenced_until": {"$gt": now_dt.isoformat()}})
        if silenced:
            continue
        a["occurrences"] = 1
        fresh.append(a)
    alerts = fresh

    if alerts:
        db.alerts.insert_many(alerts)
        for a in alerts:
            a["id"] = a.pop("_id")
        await manager.broadcast({
            "type": "alert",
            "alerts": alerts
        })
    return alerts


def _apply_device_context(telemetry_doc: dict, device_id: Optional[str], house_id: Optional[str], timestamp: datetime) -> None:
    """
    Tags an unauthenticated reading with tenant_id/house_id resolved from its
    device (or house), and marks the device online — mirrors the MQTT path.
    """
    ctx = resolve_telemetry_context(device_id, house_id)
    for key in ("tenant_id", "house_id"):
        if ctx.get(key) and not telemetry_doc.get(key):
            telemetry_doc[key] = ctx[key]
    device = ctx.get("device")
    if device:
        db.devices.update_one({"_id": device["_id"]}, {"$set": {"status": "online", "last_seen": timestamp}})


@router.post("", status_code=201)
async def ingest_telemetry(request: Request, payload: TelemetryIngest):
    """
    Accepts a single telemetry reading from a sensor or simulator.
    Writes to DB, evaluates alert rules, and broadcasts via WebSocket.
    """
    if not payload.timestamp:
        payload.timestamp = datetime.now(timezone.utc)
    else:
        # Ensure timestamp is UTC-aware if received as naive
        if payload.timestamp.tzinfo is None:
            payload.timestamp = payload.timestamp.replace(tzinfo=timezone.utc)

    # ── Write to DB (Optimized) ─────────────────────────────────────────────
    telemetry_doc = payload.dict()
    device_id = payload.device_id or f"snsr-{payload.house_id}"
    _apply_device_context(telemetry_doc, payload.device_id, payload.house_id, payload.timestamp)

    if should_save_telemetry(device_id, telemetry_doc):
        result = db.telemetry.insert_one(tag(request, telemetry_doc))
        telemetry_doc["_id"] = str(result.inserted_id)
        last_saved_cache[device_id] = telemetry_doc.copy()
    else:
        telemetry_doc["_id"] = "skipped_storage"
        
    # For JSON broadcast
    telemetry_doc["timestamp"] = payload.timestamp.isoformat()

    # ── Evaluate alert rules ──────────────────────────────────────────────────
    device_id = payload.device_id or f"snsr-{payload.house_id}"
    await evaluate_alerts(request, device_id, telemetry_doc, tenant_id=telemetry_doc.get("tenant_id"))

    # ── Broadcast via WebSocket ───────────────────────────────────────────────
    await manager.broadcast({
        "type": "telemetry",
        "data": telemetry_doc
    })

    return {
        "status": "ok", 
        "timestamp": payload.timestamp.isoformat(),
        "storage_id": telemetry_doc.get("_id"),
        "stored": telemetry_doc.get("_id") != "skipped_storage"
    }


# SEND TELEMETRY
@router.post("/send")
async def send_telemetry(request: Request, data: TelemetryCreate):

    # Store timestamp as a real MongoDB datetime so AI queries using `$gte`
    # (datetime objects) work correctly. For websocket broadcast, convert to ISO
    # string to keep JSON serialization happy.
    timestamp = datetime.now(timezone.utc)
    telemetry_doc = {
        "device_id": data.device_id,
        "temperature": data.temperature,
        "humidity": data.humidity,
        "ammonia": data.ammonia,
        "timestamp": timestamp,
    }
    _apply_device_context(telemetry_doc, data.device_id, None, timestamp)

    if should_save_telemetry(data.device_id, telemetry_doc):
        result = db.telemetry.insert_one(tag(request, telemetry_doc))
        telemetry_doc["_id"] = str(result.inserted_id)
        last_saved_cache[data.device_id] = telemetry_doc.copy()
    else:
        telemetry_doc["_id"] = "skipped_storage"

    telemetry = dict(telemetry_doc)
    telemetry["timestamp"] = timestamp.isoformat()

    # Broadcast telemetry
    await manager.broadcast({
        "type": "telemetry",
        "data": telemetry
    })

    # Evaluate alerts
    await evaluate_alerts(request, data.device_id, telemetry_doc, tenant_id=telemetry_doc.get("tenant_id"))

    return {
        "status": "ok",
        "storage_id": telemetry_doc.get("_id"),
        "stored": telemetry_doc.get("_id") != "skipped_storage"
    }


# GET TELEMETRY
@router.get("")
def get_telemetry(request: Request, 
    house_id: Optional[str] = Query(None),
    device_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    user: dict = Depends(require_auth()),
):
    query = {}
    if house_id:
        query["house_id"] = house_id
    if device_id:
        query["device_id"] = device_id

    data = list(db.telemetry.find(scoped(request, query)).sort("timestamp", -1).limit(limit))

    for item in data:
        item["_id"] = str(item["_id"])

    return data


# GET ALERTS
@router.get("/alerts")
def get_alerts(request: Request, 
    house_id: Optional[str] = Query(None),
    houseId: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    query = {}
    if status:
        query["status"] = status
    
    # Support both naming conventions
    h_id = house_id or houseId
    if h_id:
        query["house_id"] = h_id

    alerts = list(db.alerts.find(scoped(request, query)).sort("timestamp", -1).limit(200))
    house_cache = {}
    
    for a in alerts:
        a["id"] = str(a.pop("_id"))
        h_id = a.get("house_id") or a.get("houseId")
        
        # If alert doesn't have house_id, try finding it via device_id
        if not h_id and a.get("device_id"):
            device = db.devices.find_one(scoped(request, {"_id": a["device_id"]}))
            if device:
                h_id = device.get("house_id")
        
        if h_id:
            if h_id not in house_cache:
                from bson.objectid import ObjectId
                try:
                    house = db.houses.find_one(scoped(request, {"_id": ObjectId(h_id)})) or db.houses.find_one(scoped(request, {"_id": h_id}))
                    if house:
                        house_cache[h_id] = house.get("house_code", "")
                except:
                    house = db.houses.find_one(scoped(request, {"_id": h_id}))
                    if house:
                        house_cache[h_id] = house.get("house_code", "")
            
            a["house_code"] = house_cache.get(h_id, "")
            
    return alerts


@router.patch("/alerts/{alert_id}")
async def acknowledge_alert(request: Request, 
    alert_id: str,
    data: dict,
    user: dict = Depends(
        require_auth())):
    status = data.get("status")
    if status not in ["acknowledged", "resolved"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    update_data = {"status": status}
    if status == "acknowledged":
        update_data["acknowledged_at"] = datetime.utcnow().isoformat()
        update_data["acknowledged_by"] = data.get(
            "acknowledged_by", user["username"])
        # Retro-fix tenant_id if it's missing
        tenant_id = getattr(request.state, 'tenant_id', None)
        if tenant_id:
            update_data["tenant_id"] = tenant_id

    # Try scoped update first
    result = db.alerts.update_one(scoped(request, {"_id": alert_id}), {"$set": update_data})
    
    # If no match, try updating by ID only (for old alerts)
    if result.matched_count == 0:
        db.alerts.update_one({"_id": alert_id}, {"$set": update_data})

    await manager.broadcast({"type": "alert_update", "alert_id": alert_id, "status": status, "updated_by": user["username"]})
    return {"message": "Alert updated successfully"}


@router.post("/acknowledge-all")
async def acknowledge_all_alerts(request: Request, 
    data: dict = {},
    user: dict = Depends(require_auth())):
    
    house_id = data.get("house_id") or data.get("houseId")
    query = {"status": "active"}
    if house_id:
        query["house_id"] = house_id
        
    update_data = {
        "status": "acknowledged",
        "acknowledged_at": datetime.utcnow().isoformat(),
        "acknowledged_by": user["username"]
    }
    
    # Apply tenant scoping
    tenant_id = getattr(request.state, 'tenant_id', None)
    if tenant_id:
        query["tenant_id"] = tenant_id

    result = db.alerts.update_many(query, {"$set": update_data})
    
    await manager.broadcast({
        "type": "alert_bulk_update", 
        "house_id": house_id, 
        "status": "acknowledged", 
        "count": result.modified_count
    })
    
    return {"message": f"Acknowledged {result.modified_count} alerts", "count": result.modified_count}


@router.post("/alerts/{alert_id}/escalate")
def escalate_alert(request: Request, 
    alert_id: str,
    data: dict,
    user: dict = Depends(
        require_auth())):
    note = data.get("note")
    db.alerts.update_one(scoped(request, {"_id": alert_id}),
                         {"$set": {"escalated": True,
                                   "escalated_by": user["username"],
                                   "escalation_note": note}})
    return {"message": "Alert escalated"}


@router.post("/alerts/{alert_id}/silence")
def silence_alert(request: Request, 
    alert_id: str,
    data: dict,
    user: dict = Depends(
        require_auth())):
    duration_minutes = int(data.get("duration_minutes", 60))
    until = (datetime.utcnow() + timedelta(minutes=duration_minutes)).isoformat()
    res = db.alerts.update_one(scoped(request, {"_id": alert_id}),
                               {"$set": {"silenced_until": until, "silenced_by": user.get("username")}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"message": f"Alert silenced for {duration_minutes} minutes", "silenced_until": until}


# ANALYTICS
@router.get("/analytics", response_model=TelemetryAnalytics)
def get_analytics(request: Request) -> TelemetryAnalytics:

    telemetry = list(db.telemetry.find(scoped(request)))

    if not telemetry:
        # Return zeros with no records so frontend can still render safely
        return TelemetryAnalytics(
            avg_temperature=0.0,
            min_temperature=0.0,
            max_temperature=0.0,
            avg_humidity=0.0,
            min_humidity=0.0,
            max_humidity=0.0,
            avg_ammonia=0.0,
            min_ammonia=0.0,
            max_ammonia=0.0,
            records=0,
        )

    # Be defensive in case older documents are missing some fields
    temps = [
        t.get("temperature") for t in telemetry if isinstance(
            t.get("temperature"), (int, float))]
    hums = [
        t.get("humidity") for t in telemetry if isinstance(
            t.get("humidity"), (int, float))]
    amms = [
        t.get("ammonia") for t in telemetry if isinstance(
            t.get("ammonia"), (int, float))]

    if not temps or not hums or not amms:
        return TelemetryAnalytics(
            avg_temperature=0.0,
            min_temperature=0.0,
            max_temperature=0.0,
            avg_humidity=0.0,
            min_humidity=0.0,
            max_humidity=0.0,
            avg_ammonia=0.0,
            min_ammonia=0.0,
            max_ammonia=0.0,
            records=len(telemetry),
        )

    return TelemetryAnalytics(
        avg_temperature=sum(temps) / len(temps),
        min_temperature=min(temps),
        max_temperature=max(temps),
        avg_humidity=sum(hums) / len(hums),
        min_humidity=min(hums),
        max_humidity=max(hums),
        avg_ammonia=sum(amms) / len(amms),
        min_ammonia=min(amms),
        max_ammonia=max(amms),
        records=len(telemetry),
    )
