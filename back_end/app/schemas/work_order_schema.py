from pydantic import BaseModel
from typing import Optional


class WorkOrderCreate(BaseModel):
    farm_id: str
    house_id: str
    device_id: Optional[str] = None
    alert_id: Optional[str] = None
    category: str
    description: str
    priority: str
    assigned_to: Optional[str] = None
    created_by: str


class WorkOrderUpdate(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    priority: Optional[str] = None
