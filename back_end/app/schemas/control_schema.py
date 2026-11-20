from pydantic import BaseModel, Field
from typing import Optional, Any


class ModeUpdate(BaseModel):
    mode: str = Field(..., description="auto or manual")
    operator_id: str
    reason: Optional[str] = None


class FanControl(BaseModel):
    speed_percent: int = Field(..., ge=0, le=100)
    operator_id: str


class FanBoost(BaseModel):
    duration_minutes: int
    operator_id: str


class HeaterControl(BaseModel):
    target_temp: float
    operator_id: str


class HeaterActivate(BaseModel):
    active: bool
    operator_id: str


class FeederTrigger(BaseModel):
    portion_kg: float
    operator_id: str


class FeederSchedule(BaseModel):
    times: list[str]
    portion_kg: float
    operator_id: str


class LightingControl(BaseModel):
    brightness: int = Field(..., ge=0, le=100)
    on_time: str
    off_time: str
    on: bool
    operator_id: str


class BatchControl(BaseModel):
    house_ids: list[str]
    command: str
    value: Any
    operator_id: str


class ScheduledCommand(BaseModel):
    house_ids: list[str]
    command: str
    value: Any
    scheduled_at: str
    created_by: str
