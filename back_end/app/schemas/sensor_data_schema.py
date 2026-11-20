from pydantic import BaseModel


class SensorData(BaseModel):
    device_id: str
    value: float
