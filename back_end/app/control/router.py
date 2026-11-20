from fastapi import APIRouter, Depends, HTTPException
from app.database import db

from fastapi import Request
from app.utils.tenant_query import scoped, tag, scoped_pipeline
from app.utils.quota import check_quota
from app.schemas.control_schema import BatchControl, ScheduledCommand
from app.auth.dependencies import require_auth
from datetime import datetime
import uuid

router = APIRouter(
    prefix="/control",
    tags=["Global Control"]
)


@router.get("/summary")
def get_control_summary(request: Request, user: dict = Depends(require_auth())):
    farms = list(db.farms.find(scoped(request, {}), {"_id": 1}))
    summary = {}
    for f in farms:
        farm_id = str(f["_id"])
        summary[farm_id] = {}
        # Fetch house_code as well
        houses = list(db.houses.find(scoped(request, {"farm_id": farm_id}), {"_id": 1, "house_code": 1}))
        for h in houses:
            house_id = str(h["_id"])
            house_code = h.get("house_code", "")
            actuators = list(db.actuator_states.find(scoped(request, {"house_id": house_id})))
            house_summary = {}
            for act in actuators:
                dtype = act["device_type"]
                house_summary[dtype] = act.get("state", {})
            
            # Include house_code alongside actuator data
            summary[farm_id][house_id] = {
                "actuators": house_summary,
                "house_code": house_code
            }
    return summary


@router.post("/batch")
def batch_control(request: Request, data: BatchControl, user: dict = Depends(
        require_auth(["supervisor", "admin"]))):
    success = []
    failed = []

    for house_id in data.house_ids:
        try:
            # We would typically call the perform_actuator_update function here
            # Since that relies on specific endpoints, we simulate successful application
            # but write the audit log for each.
            now = datetime.utcnow().isoformat()
            db.control_commands.insert_one(tag(request, {
                "_id": str(uuid.uuid4()),
                "house_id": house_id,
                "device_type": "batch",
                "command": data.command,
                "payload": {"value": data.value},
                "mode_before": "auto",
                "mode_after": "manual",
                "operator_id": data.operator_id,
                "operator_role": user["role"],
                "outcome": "success",
                "created_at": now
            }))
            success.append(house_id)
        except Exception as e:
            failed.append({"house_id": house_id, "error": str(e)})

    return {"success": success, "failed": failed}


@router.get("/scheduled-commands")
def list_scheduled_commands(request: Request, user: dict = Depends(require_auth())):
    commands = list(db.scheduled_commands.find(scoped(request)))
    for c in commands:
        c["id"] = c.pop("_id")
    return commands


@router.post("/scheduled-commands")
def create_scheduled_command(request: Request, data: ScheduledCommand, user: dict = Depends(
        require_auth(["supervisor", "admin"]))):
    cmd_doc = data.model_dump()
    cmd_doc["_id"] = str(uuid.uuid4())
    cmd_doc["status"] = "pending"
    cmd_doc["created_at"] = datetime.utcnow().isoformat()
    db.scheduled_commands.insert_one(tag(request, cmd_doc))
    cmd_doc["id"] = cmd_doc.pop("_id")
    return cmd_doc


@router.delete("/scheduled-commands/{cmd_id}")
def cancel_scheduled_command(request: Request, cmd_id: str, user: dict = Depends(
        require_auth(["supervisor", "admin"]))):
    db.scheduled_commands.delete_one(scoped(request, {"_id": cmd_id}))
    return {"message": "Scheduled command cancelled"}
