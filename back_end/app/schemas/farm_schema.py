from pydantic import BaseModel, Field
from typing import Optional


class FarmBase(BaseModel):
    name: str = Field(..., max_length=100)
    location: Optional[str] = Field(None, max_length=200)


class FarmCreate(FarmBase):
    pass


class FarmUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    location: Optional[str] = Field(None, max_length=200)


class FarmOut(FarmBase):
    id: str
    house_count: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class FarmAggregateOut(FarmOut):
    device_count: int = 0
    risk_level: str = "LOW"
    active_alert_count: int = 0
    temp_min: Optional[float] = None
    temp_max: Optional[float] = None
    humidity_min: Optional[float] = None
    humidity_max: Optional[float] = None
    ammonia_peak: Optional[float] = None
