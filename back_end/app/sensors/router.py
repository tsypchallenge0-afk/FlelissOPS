from fastapi import APIRouter
from app.schemas.sensor_data_schema import SensorData

from fastapi import Request
from app.utils.tenant_query import scoped, tag, scoped_pipeline
from app.utils.quota import check_quota
from app.sensors.service import ingest_sensor_data

router = APIRouter(prefix="/sensors", tags=["Sensors"])


@router.post("/data")
async def send_data(request: Request, data: SensorData):

    return await ingest_sensor_data(data)
