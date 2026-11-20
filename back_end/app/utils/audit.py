from app.database import db
from datetime import datetime
from fastapi import Request
import uuid

def log_action(request: Request, action: str, target_type: str, target_id: str, details: dict = None):
    """
    Log an administrative action for audit purposes.
    """
    tenant_id = getattr(request.state, 'tenant_id', None)
    user_id   = None
    username  = "system"
    
    # Try to get user from state if auth middleware has run
    user = getattr(request.state, 'user', None)
    if user:
        user_id  = user.get('id') or str(user.get('_id'))
        username = user.get('username')

    log_entry = {
        "_id":         str(uuid.uuid4()),
        "action":      action,
        "target_type": target_type,
        "target_id":   target_id,
        "tenant_id":   tenant_id,
        "user_id":     user_id,
        "username":    username,
        "details":     details or {},
        "ip_address":  request.client.host if request.client else "unknown",
        "user_agent":  request.headers.get("user-agent", "unknown"),
        "timestamp":   datetime.utcnow().isoformat()
    }
    
    db.audit_logs.insert_one(log_entry)
    return log_entry
