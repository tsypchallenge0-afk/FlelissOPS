from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument
from app.database import db

from fastapi import Request
from app.utils.tenant_query import scoped, tag, scoped_pipeline
from app.utils.quota import check_quota
from app.auth.dependencies import require_auth
from app.schemas.alert_rule_schema import AlertRuleCreate, AlertRuleUpdate, AlertRuleOut
from datetime import datetime
import uuid

router = APIRouter(
    prefix="/alerts/rules",
    tags=["Alert Rules"]
)


@router.get("/", response_model=list[AlertRuleOut])
def list_alert_rules(request: Request, user: dict = Depends(require_auth())):
    rules = list(db.alert_rules.find(scoped(request)))
    for r in rules:
        r["id"] = r.pop("_id")
    return rules


@router.post("/", response_model=AlertRuleOut)
def create_alert_rule(request: Request, data: AlertRuleCreate, user: dict = Depends(
        require_auth(["supervisor", "admin"]))):
    rule_id = str(uuid.uuid4())
    rule_doc = {
        "_id": rule_id,
        "scope": data.scope,
        "scope_id": data.scope_id,
        "metric": data.metric,
        "warn_threshold": data.warn_threshold,
        "danger_threshold": data.danger_threshold,
        "enabled": True,
        "created_at": datetime.utcnow().isoformat()
    }
    db.alert_rules.insert_one(tag(request, rule_doc))
    rule_doc["id"] = rule_doc.pop("_id")
    return rule_doc


@router.patch("/{rule_id}", response_model=AlertRuleOut)
def update_alert_rule(request: Request, rule_id: str, data: AlertRuleUpdate, user: dict = Depends(
        require_auth(["supervisor", "admin"]))):
    result = db.alert_rules.find_one_and_update(
        {"_id": rule_id},
        {"$set": {"warn_threshold": data.warn_threshold, "danger_threshold": data.danger_threshold}},
        return_document=ReturnDocument.AFTER
    )
    if not result:
        raise HTTPException(status_code=404, detail="Rule not found")

    result["id"] = result.pop("_id")
    return result


@router.delete("/{rule_id}")
def delete_alert_rule(request: Request, rule_id: str, user: dict = Depends(
        require_auth(["supervisor", "admin"]))):
    result = db.alert_rules.delete_one(scoped(request, {"_id": rule_id}))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"message": "Rule deleted", "status": "ok"}
