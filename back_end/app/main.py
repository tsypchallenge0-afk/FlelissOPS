from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.websocket.router import router as websocket_router
from app.auth.router import router as auth_router
from app.farms.router import router as farms_router
from app.houses.router import router as houses_router
from app.devices.router import router as devices_router
from app.telemetry.router import router as telemetry_router
from app.alerts.router import router as alerts_router
from app.maintenance.router import router as maintenance_router
from app.control.router import router as control_router
from app.users.router import router as users_router
from app.ai.router import router as ai_router
from app.flock.router import router as flock_router
from app.flock.curves_router import router as curves_router
from app.analytics.router import router as analytics_router
from app.reports.router import router as reports_router
from app.reports.scheduler import load_and_schedule_all
from app.tenants.router import router as tenants_router, invite_router
from app.demo.router import router as demo_router
from app.core.mqtt import start_mqtt
import logging
from app.ai.scheduler import (
    initial_training,
    retrain_loop,
    anomaly_retrain_loop,
    prediction_broadcast_loop,
    register_house,
)
from app.ai.control_loop import run_control_loop
from app.flock.setpoint_controller import daily_setpoint_update_loop
from app.database import db
import asyncio

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    mqtt_client = start_mqtt(asyncio.get_running_loop())
    
    try:
        house_ids = [str(h["_id"]) for h in db.houses.find({}, {"_id": 1})]
    except Exception as e:
        print(f"[AI] Failed to load houses at startup: {e}")
        house_ids = []

    for hid in house_ids:
        register_house(hid)

    print(f"[AI] Starting scheduler for {len(house_ids)} houses")
    asyncio.create_task(initial_training(house_ids))
    asyncio.create_task(prediction_broadcast_loop())
    asyncio.create_task(retrain_loop())
    asyncio.create_task(anomaly_retrain_loop())
    asyncio.create_task(run_control_loop(house_ids))
    asyncio.create_task(daily_setpoint_update_loop(house_ids))
    print("[AI] Scheduler tasks created")
    
    await load_and_schedule_all()
    

    # ── Initialize TTL Indexes ───────────────────────────────────────────────
    try:
        # Telemetry: 30 days
        db.telemetry.create_index("timestamp", expireAfterSeconds=30 * 24 * 60 * 60)
        # Alerts: 90 days
        db.alerts.create_index("timestamp", expireAfterSeconds=90 * 24 * 60 * 60)
        print("[DB] TTL Indexes initialized")
    except Exception as e:
        print(f"[DB] Error initializing TTL indexes: {e}")

    yield
    
    # Shutdown (if needed)
    pass

app = FastAPI(title="Poultry IoT API", lifespan=lifespan)

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(farms_router)
app.include_router(houses_router)
app.include_router(devices_router)
app.include_router(telemetry_router)
app.include_router(websocket_router)
app.include_router(alerts_router)
app.include_router(maintenance_router)
app.include_router(control_router)
app.include_router(users_router)
app.include_router(ai_router)
# curves_router first: its static '/flocks/curve-templates' must win over flock_router's '/flocks/{id}'
app.include_router(curves_router)
app.include_router(flock_router)
app.include_router(analytics_router)
app.include_router(reports_router)
app.include_router(tenants_router)
app.include_router(invite_router)
app.include_router(demo_router)

@app.get("/")
def root():
    """Root endpoint for health checks"""
    from app.core import mqtt
    mqtt_status = "unknown"
    if mqtt.mqtt_client:
        mqtt_status = "connected" if mqtt.mqtt_client.is_connected() else "disconnected"
    
    return {
        "message": "Poultry IoT API is running",
        "status": "healthy",
        "mqtt": mqtt_status
    }
