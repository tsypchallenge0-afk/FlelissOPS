from typing import Optional

from bson import ObjectId
from fastapi import Request

from app.database import db


def get_default_tenant_id() -> str:
    """Returns the real _id (as str) of the 'default' tenant, falling back to the slug."""
    tenant = db.tenants.find_one({"subdomain": "default"}, {"_id": 1})
    return str(tenant["_id"]) if tenant else "default"


def find_device(device_id: Optional[str]) -> Optional[dict]:
    """Looks a device up by string _id, then by ObjectId (devices use both)."""
    if not device_id:
        return None
    device = db.devices.find_one({"_id": device_id})
    if not device and ObjectId.is_valid(device_id):
        device = db.devices.find_one({"_id": ObjectId(device_id)})
    return device


def resolve_telemetry_context(device_id: Optional[str] = None, house_id: Optional[str] = None) -> dict:
    """
    Works out tenant_id / house_id for an unauthenticated telemetry reading
    (HTTP sensors and simulators), the same way the MQTT handler does:
    device first, then house. Returns only the fields it could resolve,
    plus the matched device document under "device".
    """
    ctx = {}
    device = find_device(device_id)
    if device:
        ctx["device"] = device
        if device.get("tenant_id"):
            ctx["tenant_id"] = device["tenant_id"]
        if device.get("house_id"):
            ctx["house_id"] = device["house_id"]

    h_id = ctx.get("house_id") or house_id
    if h_id and "tenant_id" not in ctx:
        house = db.houses.find_one({"_id": h_id}, {"tenant_id": 1})
        if house and house.get("tenant_id"):
            ctx["tenant_id"] = house["tenant_id"]
    return ctx


def scoped(request: Request, extra_filter: dict = None) -> dict:
    """
    Returns a MongoDB filter dict that includes tenant_id scoping.
    Use this in EVERY query that touches tenant data.

    Usage:
        # Before:
        db.farms.find({'status': 'active'})

        # After:
        db.farms.find(scoped(request, {'status': 'active'}))
    """
    tenant_id = getattr(request.state, 'tenant_id', None)
    base = {}
    if tenant_id:
        base['tenant_id'] = tenant_id
    if extra_filter:
        base.update(extra_filter)
    return base


def tag(request: Request, document: dict) -> dict:
    """
    Tags a new document with tenant_id before insertion.

    Usage:
        db.farms.insert_one(tag(request, new_farm_doc))
    """
    tenant_id = getattr(request.state, 'tenant_id', None)
    if tenant_id:
        document['tenant_id'] = tenant_id
    return document

def scoped_pipeline(request: Request, pipeline: list) -> list:
    """
    Injects tenant_id into a MongoDB aggregation pipeline.
    """
    tenant_id = getattr(request.state, 'tenant_id', None)
    if tenant_id:
        if pipeline and "$match" in pipeline[0]:
            pipeline[0]["$match"]["tenant_id"] = tenant_id
        else:
            pipeline.insert(0, {"$match": {"tenant_id": tenant_id}})
    return pipeline
