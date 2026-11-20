from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from app.database import db

from fastapi import Request
from app.utils.tenant_query import scoped, tag, scoped_pipeline
from app.utils.quota import check_quota
from app.auth.dependencies import require_auth
from app.auth.service import hash_password
from pydantic import BaseModel
from app.schemas.user_schema import UserRegister
from datetime import datetime
import uuid

router = APIRouter(prefix="/users", tags=["USERS"])

class UserUpdate(BaseModel):
    role: Optional[str] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None

class PasswordReset(BaseModel):
    new_password: str

@router.get("")
@router.get("/")
def list_users(request: Request, user: dict = Depends(require_auth(['admin']))):
    try:
        users = list(db.users.find(scoped(request)))
        for u in users:
            u["id"] = str(u.pop("_id"))
            if "password" in u:
                del u["password"]
        return users
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("")
@router.post("/")
def create_user(request: Request, data: UserRegister, user: dict = Depends(require_auth(['admin']))):
    try:
        user_dict = data.dict()
        if db.users.find_one(scoped(request, {
            "$or": [
                {"email": user_dict.get('email')},
                {"username": user_dict.get('username')}
            ]
        })):
            raise HTTPException(status_code=400, detail="User already exists")

        hashed = hash_password(user_dict['password'])
        user_id = str(uuid.uuid4())
        new_user = {
            "_id": user_id,
            "username": user_dict['username'],
            "email": user_dict['email'],
            "password": hashed,
            "role": user_dict.get('role', 'operator'),
            "full_name": user_dict.get('full_name'),
            "created_at": datetime.utcnow().isoformat(),
            "is_active": True
        }
        db.users.insert_one(tag(request, new_user))
        return {"id": user_id, "username": user_dict['username'], "role": new_user['role']}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{user_id}")
def update_user(request: Request, user_id: str, data: dict, user: dict = Depends(require_auth(['admin']))):
    try:
        update_data = {k: v for k, v in data.items() if k in ['role', 'full_name', 'is_active']}
        if not update_data:
            return {"message": "nothing to update"}
        
        result = db.users.update_one(scoped(request, {"_id": user_id}), {"$set": update_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")
        return {"message": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{user_id}")
def deactivate_user(request: Request, user_id: str, user: dict = Depends(require_auth(['admin']))):
    try:
        result = db.users.update_one(scoped(request, {"_id": user_id}), {"$set": {"is_active": False}})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")
        return {"message": "deactivated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{user_id}/reset-password")
def reset_password(request: Request, user_id: str, data: PasswordReset, user: dict = Depends(require_auth(['admin']))):
    try:
        hashed = hash_password(data.new_password)
        result = db.users.update_one(scoped(request, {"_id": user_id}), {"$set": {"password": hashed}})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")
        return {"message": "password reset"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
