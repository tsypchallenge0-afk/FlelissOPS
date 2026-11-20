from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, constr


class DeviceBase(BaseModel):
    house_id: str
    house_code: Optional[str] = None
    farm_id: Optional[str] = None
    farm_name: Optional[str] = None
    name: constr(min_length=1, max_length=100)
    type: constr(min_length=1, max_length=50) = Field(
        default="sensor",
        description="Device type, e.g. sensor, gateway",
    )
    status: constr(min_length=1, max_length=20) = Field(
        default="online",
        description="High-level device status: online, offline, warn, etc.",
    )
    model: constr(min_length=1, max_length=50) = Field(
        default="SENSOR-NODE",
        description="Device model identifier shown in the UI",
    )
    last_seen: Optional[datetime] = Field(
        default=None,
        description="Timestamp of the last time this device was seen active",
    )
    position: Optional[str] = Field(
        default="Middle-Center",
        description="Physical placement zone within the house",
    )
    x_coord: Optional[float] = Field(None, description="Precise X coordinate (0.0 to 1.0)")
    y_coord: Optional[float] = Field(None, description="Precise Y coordinate (0.0 to 1.0)")


class DeviceCreate(DeviceBase):
    pass


class DeviceOut(DeviceBase):
    id: str = Field(..., description="Device identifier")
