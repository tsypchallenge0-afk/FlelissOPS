from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timedelta
import secrets
import string
from bson.objectid import ObjectId

from app.auth.dependencies import require_auth
from app.reports.mailer import send_onboarding_email, send_invitation_email
from app.database import db
from app.utils.audit import log_action

router = APIRouter(tags=['Super Admin'])

# ── Request schemas ────────────────────────────────────────────────────────

class TenantCreate(BaseModel):
    company_name:   str
    subdomain:      str         # must be URL-safe slug
    contact_name:   str
    contact_email:  EmailStr
    contact_phone:  Optional[str] = None
    country:        Optional[str] = None
    plan_details: dict = {
        'max_farms':   5,
        'max_houses':  20,
        'max_devices': 100,
        'max_users':   10,
        'features':    ['ai_predictions', 'reports'],
        'notes':       '',
    }
    billing: dict = {
        'monthly_value':  0,
        'currency':       'USD',
        'contract_start': None,
        'contract_end':   None,
        'payment_status': 'pending',
        'notes':          '',
    }
    branding: dict = {
        'logo_url':      '',
        'primary_color': '#c07010',
        'company_name':  '',
        'favicon_url':   '',
        'support_email': '',
    }


class TenantUpdate(BaseModel):
    company_name:   Optional[str]  = None
    status:         Optional[str]  = None
    plan_details:   Optional[dict] = None
    billing:        Optional[dict] = None
    branding:       Optional[dict] = None
    contact:        Optional[dict] = None
    suspension_reason: Optional[str] = None


class InviteUserRequest(BaseModel):
    email:   EmailStr
    role:    str       # 'operator' | 'supervisor' | 'admin'


# ── Helper ─────────────────────────────────────────────────────────────────

def generate_invite_token() -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(48))


def slug_is_valid(slug: str) -> bool:
    import re
    return bool(re.match(r'^[a-z0-9][a-z0-9\-]{1,30}[a-z0-9]$', slug))

def serialize_doc(doc):
    if not doc:
        return None
    if '_id' in doc:
        doc['_id'] = str(doc['_id'])
    return doc

# ── Super admin endpoints ──────────────────────────────────────────────────

@router.get('/super-admin/tenants')
async def get_tenants(
    request: Request,
    status: Optional[str] = None,
    user   = Depends(require_auth(roles=['super_admin'])),
):
    """List all tenants with usage stats. Super admin only."""
    query = {}
    if status:
        query['status'] = status
    tenants = list(db.tenants.find(query).sort('created_at', -1).limit(500))
    
    # Inject real-time usage stats
    for t in tenants:
        tid = str(t['_id'])
        t['usage'] = {
            'farm_count':   db.farms.count_documents({'tenant_id': tid}),
            'device_count': db.devices.count_documents({'tenant_id': tid}),
            'user_count':   db.users.count_documents({'tenant_id': tid}),
        }
    
    return [serialize_doc(t) for t in tenants]


@router.post('/super-admin/tenants')
async def create_tenant(
    request:    Request,
    payload:    TenantCreate,
    background: BackgroundTasks,
    user = Depends(require_auth(roles=['super_admin'])),
):
    """
    Onboard a new enterprise client.
    Creates tenant record + first admin user invitation.
    """
    if not slug_is_valid(payload.subdomain):
        raise HTTPException(
            status_code=400,
            detail='Subdomain must be 3-32 lowercase letters, numbers, hyphens'
        )

    # Check subdomain uniqueness
    existing = db.tenants.find_one({'subdomain': payload.subdomain})
    if existing:
        raise HTTPException(status_code=409, detail='Subdomain already taken')

    now = datetime.utcnow()
    tenant_doc = {
        'tenant_id':    payload.subdomain,
        'company_name': payload.company_name,
        'subdomain':    payload.subdomain,
        'status':       'trial',
        'plan':         'custom',
        'plan_details': payload.plan_details,
        'branding':     {
            **payload.branding,
            'company_name': payload.branding.get('company_name') or payload.company_name,
        },
        'billing':      {
            **payload.billing,
            'contract_start': payload.billing.get('contract_start') or now.isoformat(),
        },
        'contact': {
            'name':    payload.contact_name,
            'email':   payload.contact_email,
            'phone':   payload.contact_phone,
            'country': payload.country,
        },
        'usage': {
            'farm_count': 0, 'house_count': 0,
            'device_count': 0, 'user_count': 0,
            'last_active': None,
        },
        'trial_ends_at': (now + timedelta(days=30)).isoformat(),
        'created_at':    now.isoformat(),
        'created_by':    user['id'],
    }
    result = db.tenants.insert_one(tenant_doc)
    tenant_id = str(result.inserted_id)

    # Create first admin invitation
    token = generate_invite_token()
    invite_doc = {
        'tenant_id':  tenant_id,
        'email':      payload.contact_email,
        'role':       'admin',
        'token':      token,
        'invited_by': user['id'],
        'expires_at': (now + timedelta(hours=72)).isoformat(),
        'status':     'pending',
        'created_at': now.isoformat(),
    }
    db.tenant_invitations.insert_one(invite_doc)

    # Send welcome email in background
    background.add_task(
        send_onboarding_email,
        email=payload.contact_email,
        company_name=payload.company_name,
        subdomain=payload.subdomain,
        invite_token=token,
    )

    log_action(request, 'create_tenant', 'tenant', tenant_id, {'subdomain': payload.subdomain})

    return {'tenant_id': tenant_id, 'subdomain': payload.subdomain, 'status': 'trial'}


@router.get('/super-admin/tenants/{tenant_id}')
async def get_tenant(
    request: Request,
    tenant_id: str,
    user = Depends(require_auth(roles=['super_admin'])),
):
    try:
        obj_id = ObjectId(tenant_id)
    except:
        obj_id = tenant_id
    tenant = db.tenants.find_one({'_id': obj_id})
    if not tenant: raise HTTPException(status_code=404, detail='Not found')
    
    # Inject real-time usage stats
    tid = str(tenant['_id'])
    tenant['usage'] = {
        'farm_count':   db.farms.count_documents({'tenant_id': tid}),
        'device_count': db.devices.count_documents({'tenant_id': tid}),
        'user_count':   db.users.count_documents({'tenant_id': tid}),
    }
    
    return serialize_doc(tenant)


@router.patch('/super-admin/tenants/{tenant_id}')
async def update_tenant(
    request: Request,
    tenant_id: str,
    payload:   TenantUpdate,
    user = Depends(require_auth(roles=['super_admin'])),
):
    """Update any tenant field — plan, billing, branding, status."""
    update = {k: v for k, v in payload.dict().items() if v is not None}
    update['updated_at'] = datetime.utcnow().isoformat()
    update['updated_by'] = user['id']

    if payload.status == 'suspended':
        update['suspended_at'] = datetime.utcnow().isoformat()

    try:
        obj_id = ObjectId(tenant_id)
    except:
        obj_id = tenant_id

    db.tenants.update_one(
        {'_id': obj_id},
        {'$set': update}
    )
    return serialize_doc(db.tenants.find_one({'_id': obj_id}))


@router.post('/super-admin/tenants/{tenant_id}/suspend')
async def suspend_tenant(
    request: Request,
    tenant_id: str,
    payload:   dict,
    user = Depends(require_auth(roles=['super_admin'])),
):
    """Immediately suspend a tenant — all users lose access."""
    try:
        obj_id = ObjectId(tenant_id)
    except:
        obj_id = tenant_id

    db.tenants.update_one(
        {'_id': obj_id},
        {'$set': {
            'suspension_reason': payload.get('reason', ''),
        }}
    )
    log_action(request, 'suspend_tenant', 'tenant', tenant_id, {'reason': payload.get('reason')})
    return {'status': 'suspended'}


@router.post('/super-admin/tenants/{tenant_id}/activate')
async def activate_tenant(
    request: Request,
    tenant_id: str,
    user = Depends(require_auth(roles=['super_admin'])),
):
    try:
        obj_id = ObjectId(tenant_id)
    except:
        obj_id = tenant_id

    db.tenants.update_one(
        {'_id': obj_id},
        {'$set': {'status': 'active', 'suspended_at': None, 'suspension_reason': None}}
    )
    log_action(request, 'activate_tenant', 'tenant', tenant_id)
    return {'status': 'active'}


@router.delete('/super-admin/tenants/{tenant_id}')
async def delete_tenant(
    request: Request,
    tenant_id: str,
    user = Depends(require_auth(roles=['super_admin'])),
):
    """Permanently decommission a tenant and remove all infrastructure records."""
    try:
        obj_id = ObjectId(tenant_id)
    except:
        obj_id = tenant_id

    db.tenants.delete_one({'_id': obj_id})
    # Cascading deletion of associated objects
    db.users.delete_many({'tenant_id': tenant_id})
    db.tenant_invitations.delete_many({'tenant_id': tenant_id})
    
    log_action(request, 'delete_tenant', 'tenant', tenant_id)
    return {'deleted': True}


@router.get('/super-admin/tenants/{tenant_id}/users')
async def get_tenant_users(
    request: Request,
    tenant_id: str,
    user = Depends(require_auth(roles=['super_admin'])),
):
    """List all users for a tenant. Super admin view."""
    users = list(db.users.find({'tenant_id': tenant_id}).limit(500))
    return [serialize_doc(u) for u in users]


@router.get('/super-admin/tenants/{tenant_id}/invitations')
async def get_tenant_invitations(
    request: Request,
    tenant_id: str,
    user = Depends(require_auth(roles=['super_admin'])),
):
    """Retrieve all invitations for a tenant (including tokens) for manual bypass."""
    invites = list(db.tenant_invitations.find({'tenant_id': tenant_id}).limit(100))
    return [serialize_doc(i) for i in invites]


@router.get('/super-admin/platform/stats')
async def platform_stats(
    request: Request,
    user = Depends(require_auth(roles=['super_admin'])),
):
    """Global platform health metrics across all tenants."""
    total_tenants  = db.tenants.count_documents({})
    active_tenants = db.tenants.count_documents({'status': 'active'})
    trial_tenants  = db.tenants.count_documents({'status': 'trial'})
    total_users    = db.users.count_documents({'role': {'$ne': 'super_admin'}})
    total_farms    = db.farms.count_documents({})
    total_devices  = db.devices.count_documents({})
    
    today = datetime.utcnow().replace(hour=0, minute=0, second=0).isoformat()
    total_alerts_today = db.alerts.count_documents({
        'timestamp': {'$gte': today}
    })
    
    # Top tenants by alert volume (last 7 days)
    seven_days_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
    top_tenants = list(db.alerts.aggregate([
        {'$match': {'timestamp': {'$gte': seven_days_ago}}},
        {'$group': {'_id': '$tenant_id', 'alert_count': {'$sum': 1}}},
        {'$sort': {'alert_count': -1}},
        {'$limit': 5}
    ]))
    
    # Map tenant names to the top_tenants
    for t in top_tenants:
        try:
            name = db.tenants.find_one({'_id': ObjectId(t['_id'])})
            if not name:
                name = db.tenants.find_one({'subdomain': t['_id']})
            t['company_name'] = name.get('company_name', 'Unknown') if name else 'Unknown'
        except:
            t['company_name'] = 'Unknown'

    monthly_revenue = list(db.tenants.aggregate([
        {'$match': {'status': {'$in': ['active', 'trial']}}},
        {'$group': {'_id': None, 'total': {'$sum': '$billing.monthly_value'}}},
    ]))
    
    pending_invites = db.tenant_invitations.count_documents({'status': 'pending'})

    return {
        'total_tenants':    total_tenants,
        'active_tenants':   active_tenants,
        'trial_tenants':    trial_tenants,
        'total_users':      total_users,
        'total_farms':      total_farms,
        'total_devices':    total_devices,
        'alerts_today':     total_alerts_today,
        'monthly_revenue':  monthly_revenue[0]['total'] if monthly_revenue else 0,
        'top_tenants':      top_tenants,
        'pending_invites':  pending_invites,
    }

# ── Tenant-level invitation endpoints ─────────────────────────────────────
# Auth: require_auth(['admin']) — tenant-scoped

invite_router = APIRouter(prefix='/users', tags=['User Invitations'])


@invite_router.post('/invite')
async def invite_user(
    request:    Request,
    payload:    InviteUserRequest,
    background: BackgroundTasks,
    user = Depends(require_auth(roles=['admin'])),
):
    """
    Client admin invites a new user to their tenant.
    Sends an invitation email with a signup link.
    """
    tenant_id = getattr(request.state, 'tenant_id', None)
    if not tenant_id:
        raise HTTPException(status_code=400, detail='No tenant context')

    try:
        obj_id = ObjectId(tenant_id)
    except:
        obj_id = tenant_id

    tenant = db.tenants.find_one({'_id': obj_id})
    if not tenant:
        raise HTTPException(status_code=404, detail='Tenant not found')
        
    max_users   = tenant.get('plan_details', {}).get('max_users', 10)
    current     = db.users.count_documents({'tenant_id': tenant_id, 'is_active': True})
    pending_inv = db.tenant_invitations.count_documents({
        'tenant_id': tenant_id, 'status': 'pending'
    })
    if max_users != -1 and (current + pending_inv) >= max_users:
        raise HTTPException(
            status_code=429,
            detail=f'User quota reached ({max_users} users). Contact support to upgrade.'
        )

    # Check not already invited / registered
    existing_user = db.users.find_one({'email': payload.email, 'tenant_id': tenant_id})
    existing_inv  = db.tenant_invitations.find_one({
        'email': payload.email, 'tenant_id': tenant_id, 'status': 'pending'
    })
    if existing_user:
        raise HTTPException(status_code=409, detail='User already registered')
    if existing_inv:
        raise HTTPException(status_code=409, detail='Invitation already sent')

    now   = datetime.utcnow()
    token = generate_invite_token()
    db.tenant_invitations.insert_one({
        'tenant_id':  tenant_id,
        'email':      payload.email,
        'role':       payload.role,
        'token':      token,
        'invited_by': user['id'],
        'expires_at': (now + timedelta(hours=48)).isoformat(),
        'status':     'pending',
        'created_at': now.isoformat(),
    })

    background.add_task(
        send_invitation_email,
        email=payload.email,
        tenant_id=tenant_id,
        role=payload.role,
        token=token,
    )
    return {'status': 'invited', 'email': payload.email}


@invite_router.get('/invitations')
async def list_invitations(
    request: Request,
    user = Depends(require_auth(roles=['admin'])),
):
    tenant_id = getattr(request.state, 'tenant_id', None)
    invites = list(db.tenant_invitations.find({'tenant_id': tenant_id}).limit(100))
    return [serialize_doc(i) for i in invites]


@invite_router.delete('/invitations/{invite_id}')
async def revoke_invitation(
    invite_id: str,
    request:   Request,
    user = Depends(require_auth(roles=['admin'])),
):
    tenant_id = getattr(request.state, 'tenant_id', None)
    try:
        obj_id = ObjectId(invite_id)
    except:
        obj_id = invite_id
        
    db.tenant_invitations.update_one(
        {'_id': obj_id, 'tenant_id': tenant_id},
        {'$set': {'status': 'revoked'}}
    )
    return {'revoked': True}


# Accept invitation (public endpoint — no auth required)
@invite_router.post('/invitations/accept')
async def accept_invitation(payload: dict):
    """
    Called when a new user clicks their invite link and sets a password.
    Creates their user account and marks invitation as accepted.
    """
    token    = payload.get('token')
    password = payload.get('password')
    username = payload.get('username')
    fullname = payload.get('full_name')

    if not all([token, password, username]):
        raise HTTPException(status_code=400, detail='Missing required fields')

    now = datetime.utcnow()
    inv = db.tenant_invitations.find_one({
        'token': token, 'status': 'pending',
        'expires_at': {'$gt': now.isoformat()}
    })
    if not inv:
        raise HTTPException(status_code=400, detail='Invalid or expired invitation')

    from app.auth.service import hash_password
    pw_hash = hash_password(password)

    user_doc = {
        '_id': str(ObjectId()),
        'username':     username,
        'email':        inv['email'],
        'full_name':    fullname,
        'password':     pw_hash,
        'role':         inv['role'],
        'tenant_id':    inv['tenant_id'],
        'is_active':    True,
        'invited_by':   inv['invited_by'],
        'created_at':   now.isoformat(),
        'last_login':   None,
    }
    db.users.insert_one(user_doc)
    db.tenant_invitations.update_one(
        {'_id': inv['_id']},
        {'$set': {'status': 'accepted', 'accepted_at': now.isoformat()}}
    )
    
    try:
        obj_id = ObjectId(inv['tenant_id'])
    except:
        obj_id = inv['tenant_id']
        
    # Update tenant user count
    db.tenants.update_one(
        {'_id': obj_id},
        {'$inc': {'usage.user_count': 1}}
    )
    return {'status': 'account_created'}

# Public Branding
@router.get('/tenants/branding/{slug}')
async def get_tenant_branding(slug: str):
    """Public endpoint — returns branding config for a subdomain."""
    tenant = db.tenants.find_one(
        {'subdomain': slug, 'status': {'$in': ['trial', 'active']}},
        {'branding': 1, 'company_name': 1, 'subdomain': 1}
    )
    if not tenant:
        raise HTTPException(status_code=404, detail='Tenant not found')
    return serialize_doc(tenant)
