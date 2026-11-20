from fastapi import APIRouter, Depends, HTTPException
from app.auth.dependencies import require_auth
from app.schemas.user_schema import UserRegister, UserLogin, AuthResponse
from app.auth.service import register_user, login_user

router = APIRouter(prefix="/auth", tags=["AUTH"])


@router.post("/register")
def register(data: UserRegister) -> AuthResponse:
    return register_user(data)


@router.post("/login", response_model=AuthResponse)
def login(data: UserLogin) -> AuthResponse:
    try:
        return login_user(data)
    except HTTPException:
        raise
    except Exception as e:
        # Keep login responses deterministic for the frontend.
        raise HTTPException(status_code=401, detail="Invalid credentials") from e


@router.get("/me")
def get_me(user: dict = Depends(require_auth())):
    return user


@router.post("/logout")
def logout(user: dict = Depends(require_auth())):
    return {"message": "logged out"}
