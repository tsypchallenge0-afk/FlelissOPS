from pydantic import BaseModel
from typing import Optional


class AlertRuleCreate(BaseModel):
    scope: str
    scope_id: Optional[str] = None
    metric: str
    warn_threshold: float
    danger_threshold: float


class AlertRuleUpdate(BaseModel):
    warn_threshold: float
    danger_threshold: float


class AlertRuleOut(BaseModel):
    id: str
    scope: str
    scope_id: Optional[str] = None
    metric: str
    warn_threshold: float
    danger_threshold: float
    enabled: bool
