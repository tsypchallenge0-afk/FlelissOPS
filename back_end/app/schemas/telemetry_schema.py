from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class TelemetryCreate(BaseModel):
    device_id: str
    temperature: float
    humidity: float
    ammonia: float


class TelemetryAnalytics(BaseModel):
    avg_temperature: float = Field(...,
                                   description="Average temperature across all telemetry records")
    min_temperature: float
    max_temperature: float

    avg_humidity: float
    min_humidity: float
    max_humidity: float

    avg_ammonia: float
    min_ammonia: float
    max_ammonia: float

    records: int = Field(...,
                         description="Total number of telemetry records included")


class TelemetryIngest(BaseModel):
    timestamp:   Optional[datetime] = None
    house_id:    str
    farm_id:     Optional[str] = None
    temperature: float
    humidity:    float
    ammonia:     float
    device_id:   Optional[str] = None
