from fastapi import HTTPException, Request
from bson.objectid import ObjectId
from app.database import db

def check_quota(request: Request, resource: str):
    """
    Call before creating farms, houses, or devices.
    resource: 'farm' | 'house' | 'device' | 'user'
    """
    tenant_id = getattr(request.state, 'tenant_id', None)
    if not tenant_id:
        return  # super admin — no quota

    try:
        obj_id = ObjectId(tenant_id)
    except:
        obj_id = tenant_id

    tenant = db.tenants.find_one({'_id': obj_id})
    if not tenant:
        raise HTTPException(status_code=403, detail='Tenant not found')

    plan      = tenant.get('plan_details', {})
    
    usage_map = {
        'farm':   ('max_farms',   db.farms),
        'house':  ('max_houses',  db.houses),
        'device': ('max_devices', db.devices),
        'user':   ('max_users',   db.users),
    }
    
    if resource not in usage_map:
        return

    limit_key, collection = usage_map[resource]
    limit   = plan.get(limit_key, -1)
    
    if limit != -1:
        current = collection.count_documents({'tenant_id': tenant_id})
        if current >= limit:
            raise HTTPException(
                status_code=429,
                detail=f'{resource.title()} quota reached ({limit}). Contact support to increase your limit.'
            )
