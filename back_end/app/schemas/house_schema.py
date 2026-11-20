from pydantic import BaseModel, Field
from typing import Optional


class HouseBase(BaseModel):
    name: Optional[str] = Field(None, max_length=50)
    house_code: Optional[str] = Field(None, max_length=20)
    capacity: Optional[int] = None
    length_m: Optional[float] = Field(120.0, description="House length in meters")
    width_m: Optional[float] = Field(15.0, description="House width in meters")


class HouseCreate(HouseBase):
    farm_id: str


class HouseOut(HouseBase):
    id: str
    farm_id: Optional[str] = None
    created_at: Optional[str] = None
    length_m: Optional[float] = None
    width_m: Optional[float] = None
