import logging
from typing import Optional
from fastapi import Request, HTTPException
from functools import wraps
from app.database import db
_log = logging.getLogger(__name__)

logger = logging.getLogger(__name__)


def extract_tenant_from_subdomain(host: str) -> Optional[str]:
    """
    Extract tenant slug from request host header.
    farmcorp.avifarm.com → 'farmcorp'
    avifarm.com          → None (super admin or public)
    localhost:8000       → None (development)
    """
    if not host:
        return None

    # Strip port
    host = host.split(':')[0]
    _log.debug(f"[TENANT] Resolving host: {host}")

    # Development shortcuts
    if host in ('localhost', '127.0.0.1'):
        return 'default'
    
    # Handle local network IPs (e.g. 192.168.x.x)
    import re
    if re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', host):
        _log.debug(f"[TENANT] IP host detected: {host}. Mapping to 'default' tenant.")
        return 'default'
    
    if host in ('avifarm.com', 'www.avifarm.com', 'lvh.me', 'www.lvh.me'):
        return None

    parts = host.split('.')
    
    # Handle single word host (localhost)
    if len(parts) == 1:
        if parts[0] in ('localhost', '127.0.0.1'):
            return 'default'
        return None

    # Handle subdomains (tenant.avifarm.com or tenant.localhost)
    subdomain = parts[0]
    if subdomain in ('www', 'api', 'super', 'admin', 'mail', 'static', 'flelissops', 'lvh'):
        return None
        
    return subdomain


def get_tenant_from_request(request: Request) -> Optional[dict]:
    """
    Resolves tenant from the request's host header.
    Returns the full tenant document or None if super-admin domain.
    Note: Since our DB uses synchronous PyMongo, we don't await here.
    """
    host        = request.headers.get('host', '')
    tenant_slug = extract_tenant_from_subdomain(host)
    _log.debug(f"[TENANT] Extracted slug: '{tenant_slug}' from host '{host}'")

    if not tenant_slug:
        _log.debug("[TENANT] No slug found, assuming Super Admin/Public context.")
        return None

    _log.debug(f"[TENANT] Querying DB for subdomain='{tenant_slug}'...")
    tenant = db.tenants.find_one({
        'subdomain': tenant_slug,
        'status':    {'$in': ['trial', 'active']},
    })

    if not tenant:
        _log.debug(f"[TENANT] FAILED: Tenant '{tenant_slug}' not found in DB or inactive.")
        raise HTTPException(
            status_code=404,
            detail=f'Tenant "{tenant_slug}" not found or inactive'
        )

    _log.debug(f"[TENANT] SUCCESS: Resolved to tenant '{tenant_slug}' ({tenant.get('company_name')})")
    return tenant


def require_tenant_access(func):
    """
    Decorator that ensures the authenticated user belongs to the
    tenant resolved from the subdomain.
    Attach resolved tenant to request.state.tenant.
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        request = kwargs.get('request') or next(
            (a for a in args if isinstance(a, Request)), None
        )
        user = kwargs.get('user')

        if request and user:
            tenant = get_tenant_from_request(request)
            if tenant:
                tenant_id = str(tenant['_id'])
                # Super admins bypass tenant checks
                if user.get('role') != 'super_admin':
                    if user.get('tenant_id') != tenant_id:
                        raise HTTPException(
                            status_code=403,
                            detail='Access denied — wrong tenant'
                        )
                request.state.tenant    = tenant
                request.state.tenant_id = tenant_id
            else:
                request.state.tenant    = None
                request.state.tenant_id = None

        return await func(*args, **kwargs)
    return wrapper
