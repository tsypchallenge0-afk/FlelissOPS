from datetime import datetime
from app.database import db

from fastapi import Request
from app.utils.tenant_query import scoped, tag, scoped_pipeline
from app.utils.quota import check_quota


def check_alerts(data, request: Request = None):

    alerts = []

    if data["temperature"] > 34:
        alerts.append({
            "type": "heat_stress",
            "message": "Temperature too high",
            "value": data["temperature"]
        })

    if data["humidity"] > 80:
        alerts.append({
            "type": "high_humidity",
            "message": "Humidity too high",
            "value": data["humidity"]
        })

    if data["ammonia"] > 20:
        alerts.append({
            "type": "ammonia_risk",
            "message": "Ammonia concentration dangerous",
            "value": data["ammonia"]
        })

    for alert in alerts:

        alert["device_id"] = data["device_id"]
        alert["timestamp"] = datetime.utcnow()

        db.alerts.insert_one(tag(request, alert) if request is not None else alert)

    return alerts
