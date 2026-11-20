from app.database import db

from fastapi import Request
from app.utils.tenant_query import scoped, tag, scoped_pipeline
from app.utils.quota import check_quota
from bson import ObjectId
from datetime import datetime
from fastapi import HTTPException
from app.websocket.manager import manager


async def ingest_sensor_data(request: Request, data):

    try:
        device_id = ObjectId(data.device_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid device_id")

    device = db.devices.find_one(scoped(request, {"_id": device_id}))

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    record = {
        "device_id": device_id,
        "value": data.value,
        "timestamp": datetime.utcnow()
    }

    db.sensor_data.insert_one(tag(request, record))

    await manager.broadcast({
        "device_id": str(device_id),
        "value": data.value
    })

    return {"status": "stored"}
