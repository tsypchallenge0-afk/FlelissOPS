from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import ReturnDocument
from fastapi.responses import StreamingResponse
from app.database import db

from fastapi import Request
from app.utils.tenant_query import scoped, tag, scoped_pipeline
from app.utils.quota import check_quota
from app.schemas.work_order_schema import WorkOrderCreate, WorkOrderUpdate
from app.auth.dependencies import require_auth
from datetime import datetime
import uuid
import io
import csv
from bson import ObjectId

router = APIRouter(
    prefix="/maintenance/workorders",
    tags=["Maintenance"]
)


def _json_safe(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    return value


@router.get("")
def get_work_orders(request: Request, 
    farmId: str = None,
    houseId: str = None,
    status: str = None,
    assignedTo: str = None,
    priority: str = None,
    user: dict = Depends(require_auth())
):
    try:
        query = {}
        if farmId:
            query["farm_id"] = farmId
        if houseId:
            query["house_id"] = houseId
        if status:
            query["status"] = status
        if assignedTo:
            query["assigned_to"] = assignedTo
        if priority:
            query["priority"] = priority

        # Don't return soft cancelled items by default
        if not status:
            query["status"] = {"$ne": "cancelled"}

        orders = list(db.work_orders.find(scoped(request, query)).sort("created_at", -1))

        # Simulate SQL JOINs as requested in step 7 prompt
        for o in orders:
            o["id"] = str(o.pop("_id"))
            if "farm_id" in o and o["farm_id"] is not None:
                o["farm_id"] = str(o["farm_id"])
            if "house_id" in o and o["house_id"] is not None:
                o["house_id"] = str(o["house_id"])
            if "device_id" in o and o["device_id"] is not None:
                o["device_id"] = str(o["device_id"])
            # Just stubbing join logic
            if "farm_id" in o:
                farm = db.farms.find_one(scoped(request, {"_id": o["farm_id"]}), {"name": 1})
                o["farm_name"] = farm["name"] if farm else None
            if "house_id" in o:
                house = db.houses.find_one(scoped(request, {"_id": o["house_id"]}), {"name": 1, "house_code": 1})
                o["house_name"] = house["name"] if house else None
                o["house_code"] = house.get("house_code") if house else None

        return [_json_safe(o) for o in orders]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load work orders: {e}") from e


@router.post("")
def create_work_order(request: Request, data: WorkOrderCreate, user: dict = Depends(
        require_auth(["supervisor", "admin"]))):
    wo_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    wo_doc = data.model_dump()
    wo_doc["_id"] = wo_id
    wo_doc["status"] = "open"
    wo_doc["created_at"] = now
    wo_doc["updated_at"] = now

    db.work_orders.insert_one(tag(request, wo_doc))
    wo_doc["id"] = wo_doc.pop("_id")
    return wo_doc


@router.patch("/{order_id}")
def update_work_order(request: Request, order_id: str, data: WorkOrderUpdate,
                      user: dict = Depends(require_auth(["supervisor", "admin"]))):
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()

    if update_data.get("status") == "resolved":
        update_data["resolved_at"] = datetime.utcnow().isoformat()

    result = db.work_orders.find_one_and_update(
        {"_id": order_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER
    )
    if not result:
        raise HTTPException(status_code=404, detail="Work order not found")

    result["id"] = result.pop("_id")
    return result


@router.delete("/{order_id}")
def delete_work_order(request: Request, 
    order_id: str,
    user: dict = Depends(
        require_auth(
            ["admin"]))):
    # Soft delete
    db.work_orders.update_one(scoped(request, {"_id": order_id}),
                              {"$set": {"status": "cancelled",
                                        "updated_at": datetime.utcnow().isoformat()}})
    return {"message": "Work order cancelled"}


@router.get("/export")
def export_work_orders(request: Request, 
    farmId: str = None,
    _from: str = Query(None, alias="from"),
    to: str = None,
    user: dict = Depends(require_auth(["supervisor", "admin"]))
):
    query = {"status": "resolved"}
    if farmId:
        query["farm_id"] = farmId
    if _from or to:
        date_q = {}
        if _from:
            date_q["$gte"] = _from
        if to:
            date_q["$lte"] = to
        query["resolved_at"] = date_q

    orders = db.work_orders.find(scoped(request, query))

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID",
                     "Farm",
                     "House",
                     "Device",
                     "Category",
                     "Description",
                     "Priority",
                     "Assigned To",
                     "Resolved At"])

    for o in orders:
        writer.writerow([
            str(o.get("_id", "")),
            o.get("farm_id", ""),
            o.get("house_id", ""),
            o.get("device_id", ""),
            o.get("category", ""),
            o.get("description", ""),
            o.get("priority", ""),
            o.get("assigned_to", ""),
            o.get("resolved_at", "")
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=resolved_orders.csv"}
    )
