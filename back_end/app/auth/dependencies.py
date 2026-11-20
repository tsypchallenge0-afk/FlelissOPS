from typing import List, Optional
import os
from fastapi import Depends, HTTPException, Security, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from dotenv import load_dotenv

from app.middleware.tenant import get_tenant_from_request
import logging
_log = logging.getLogger(__name__)

load_dotenv()
JWT_SECRET = os.getenv("JWT_SECRET", "supersecret")
ALGORITHM = "HS256"

if JWT_SECRET == "supersecret":
    _log.warning(
        "JWT_SECRET is not set - using the insecure development default. "
        "Set JWT_SECRET in back_end/.env before sharing or deploying this server."
    )

security = HTTPBearer()

def require_auth(roles: Optional[List[str]] = None):
    def dependency(
            request: Request,
            credentials: HTTPAuthorizationCredentials = Security(security)):
        token = credentials.credentials
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            role = payload.get("role")
            username = payload.get("username")
            tenant_id = payload.get("tenant_id")
            
            if user_id is None:
                raise HTTPException(status_code=401, detail="Invalid token")

            if roles and role not in roles:
                raise HTTPException(
                    status_code=403,
                    detail="Insufficient permissions")

            user = {
                "id": user_id,
                "role": role,
                "username": username,
                "tenant_id": tenant_id
            }
            
            # Tenant isolation check
            if role != 'super_admin':
                tenant = get_tenant_from_request(request)
                if tenant:
                    resolved_tenant_id = str(tenant['_id'])
                    _log.debug(f"[AUTH] User Tenant: {user['tenant_id']} | Resolved Tenant: {resolved_tenant_id}")
                    if user['tenant_id'] != resolved_tenant_id:
                        _log.debug("[AUTH] MISMATCH! Raising 403")
                        raise HTTPException(
                            status_code=403,
                            detail='Access denied — wrong tenant'
                        )
                    request.state.tenant_id = resolved_tenant_id
                else:
                    _log.debug("[AUTH] NO TENANT RESOLVED! Raising 403")
                    raise HTTPException(
                        status_code=403,
                        detail='Tenant required'
                    )
            else:
                # Super admin — set tenant_id from query param or header if drilling into a tenant
                override_tenant = request.headers.get('X-Tenant-ID') or request.query_params.get('tenant_id')
                
                # Fallback: Resolve from host header if on a tenant subdomain
                if not override_tenant:
                    tenant = get_tenant_from_request(request)
                    if tenant:
                        override_tenant = str(tenant['_id'])
                
                request.state.tenant_id = override_tenant

            request.state.user = user
            return user
            
        except JWTError:
            raise HTTPException(
                status_code=401,
                detail="Token is invalid or expired")

    return dependency
