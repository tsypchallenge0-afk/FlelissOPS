from app.database import db
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta
from app.auth.dependencies import JWT_SECRET, ALGORITHM
from fastapi import HTTPException
import uuid
from pymongo.errors import PyMongoError, OperationFailure, ServerSelectionTimeoutError
from app.utils.tenant_query import get_default_tenant_id

pwd_context = CryptContext(
    schemes=["pbkdf2_sha256", "bcrypt"],
    deprecated="auto",
)


def hash_password(password: str):
    return pwd_context.hash(password[:72])


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password[:72], hashed_password)


def register_user(data):
    try:
        email = data.email
        password = data.password[:72]

        try:
            existing_user = db.users.find_one({"email": email})
        except (OperationFailure, ServerSelectionTimeoutError) as e:
            raise HTTPException(status_code=503, detail=f"Database unavailable: {e}") from e
        except PyMongoError as e:
            raise HTTPException(status_code=503, detail="Database error") from e

        if existing_user:
            raise HTTPException(status_code=400, detail="User already exists")

        try:
            hashed_password = hash_password(password)
        except Exception as e:
            raise HTTPException(status_code=400, detail="Invalid password format") from e

        user_id = str(uuid.uuid4())
        # Must be the tenant's real _id — that's what require_auth compares against.
        tenant_id = get_default_tenant_id()

        try:
            db.users.insert_one({
                "_id": user_id,
                "username": data.username,
                "email": email,
                "password": hashed_password,
                "role": "operator",
                "full_name": data.full_name,
                "tenant_id": tenant_id,
                "is_active": True,
                "created_at": datetime.utcnow().isoformat()
            })
        except (OperationFailure, ServerSelectionTimeoutError) as e:
            raise HTTPException(status_code=503, detail=f"Database unavailable: {e}") from e
        except PyMongoError as e:
            raise HTTPException(status_code=503, detail="Database error") from e

        # Generate JWT for new user
        payload = {
            "sub": user_id,
            "username": data.username,
            "role": "operator",
            "tenant_id": tenant_id,
            "exp": int((datetime.utcnow() + timedelta(hours=24)).timestamp())
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)

        return {
            "token": token,
            "user": {
                "id": user_id,
                "username": data.username,
                "role": "operator",
                "full_name": data.full_name,
                "tenant_id": tenant_id
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail="Unable to register user") from e


def login_user(data):
    try:
        identifier = str(data.username).strip()
        password = data.password[:72]

        try:
            user = db.users.find_one({"$or": [{"email": identifier}, {"username": identifier}]})
        except (OperationFailure, ServerSelectionTimeoutError) as e:
            raise HTTPException(status_code=503, detail=f"Database unavailable: {e}") from e
        except PyMongoError as e:
            raise HTTPException(status_code=503, detail="Database error") from e

        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        user_id = user.get("_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        stored_hash = user.get("password")
        if not stored_hash:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        try:
            if not verify_password(password, stored_hash):
                raise HTTPException(status_code=401, detail="Invalid credentials")
        except HTTPException:
            raise
        except Exception as e:
            # passlib/bcrypt parsing errors should not bubble as 500 for login.
            raise HTTPException(status_code=401, detail="Invalid credentials") from e

        # Update last login (non-fatal if it fails)
        try:
            db.users.update_one({"_id": user_id}, {
                                "$set": {"last_login": datetime.utcnow().isoformat()}})
        except PyMongoError:
            pass

        # Generate JWT
        payload = {
            "sub": str(user_id),
            "username": user.get("username", identifier),
            "role": user.get("role", "operator"),
            "tenant_id": user.get("tenant_id"),
            "exp": int((datetime.utcnow() + timedelta(hours=24)).timestamp())
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)

        return {
            "token": token,
            "user": {
                "id": str(user_id),
                "username": user.get("username", identifier),
                "role": user.get("role", "operator"),
                "full_name": user.get("full_name"),
                "tenant_id": user.get("tenant_id")
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        # Final safety net: keep auth endpoint from returning opaque 500 crashes.
        raise HTTPException(status_code=401, detail="Invalid credentials") from e
