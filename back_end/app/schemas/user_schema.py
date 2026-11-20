from pydantic import BaseModel, EmailStr, Field
from typing import Optional


class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(default="operator")
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: str
    username: str
    role: str
    full_name: Optional[str]


class AuthResponse(BaseModel):
    token: str
    user: UserResponse
