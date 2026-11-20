import json
import logging
import paho.mqtt.client as mqtt
from app.database import db
from app.websocket.manager import manager
from datetime import datetime, timezone
import asyncio
from bson import ObjectId
from app.telemetry.router import evaluate_alerts

logger = logging.getLogger(__name__)

MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC = "telemetry/send"

# Global to store the main event loop
main_loop = None
mqtt_client = None

def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("✅ MQTT: Connected to Broker!")
        client.subscribe("telemetry/#")
        client.subscribe("system/health")
    else:
        print(f"❌ MQTT: Connection failed with code {rc}")

def on_message(client, userdata, msg):
    try:
        payload_str = msg.payload.decode()
        
        payload = json.loads(payload_str)
        device_id = payload.get("device_id")
        
        if not device_id:
            return

        # Prepare telemetry document
        timestamp = datetime.now(timezone.utc)
        telemetry_doc = {
            "device_id": device_id,
            "temperature": payload.get("temperature"),
            "humidity": payload.get("humidity"),
            "ammonia": payload.get("ammonia"),
            "timestamp": timestamp,
        }

        # Resolve tenant_id from device
        try:
            # Try searching as string first, then as ObjectId
            device_query = {"_id": device_id}
            device = db.devices.find_one(device_query)
            if not device and len(device_id) == 24:
                device = db.devices.find_one({"_id": ObjectId(device_id)})
            
            # Find default tenant ID for fallback
            default_tenant = db.tenants.find_one({"subdomain": "default"})
            default_tenant_id = str(default_tenant["_id"]) if default_tenant else "default"

            if device:
                telemetry_doc["tenant_id"] = device.get("tenant_id", default_tenant_id)
                telemetry_doc["house_id"] = device.get("house_id") # Add house_id here
                
                # Update device status and last_seen
                db.devices.update_one(device_query, {"$set": {"status": "online", "last_seen": timestamp}})
                if len(device_id) == 24:
                     db.devices.update_one({"_id": ObjectId(device_id)}, {"$set": {"status": "online", "last_seen": timestamp}})
            else:
                # DISCOVERY: If device not in DB, add to discovered_devices
                telemetry_doc["tenant_id"] = default_tenant_id
                db.discovered_devices.update_one(
                    {"device_id": device_id},
                    {"$set": {
                        "device_id": device_id,
                        "last_seen": timestamp,
                        "last_payload": payload,
                        "status": "unregistered",
                        "type": "combined"
                    }},
                    upsert=True
                )
                print(f"✨ MQTT: Discovered new device: {device_id}")

        except Exception as e:
            logger.error(f"Error resolving tenant or updating status: {e}")
            telemetry_doc["tenant_id"] = "default"

        # ── Storage Optimization (Deadband + Heartbeat) ──────────────────────
        from app.telemetry.router import should_save_telemetry, last_saved_cache
        
        # Sanity Check: If values are physically impossible, skip storage/alerts
        # (Example: user provided ammonia: 2.5e21)
        amm = telemetry_doc.get("ammonia")
        if amm is not None and (amm > 1000000 or amm < -100):
            logger.warning(f"⚠️ MQTT: Discarding garbage ammonia value from {device_id}: {amm}")
            telemetry_doc["ammonia"] = None # Nullify the garbage value
            
        if should_save_telemetry(device_id, telemetry_doc):
            # Insert into DB
            result = db.telemetry.insert_one(telemetry_doc)
            telemetry_doc["_id"] = str(result.inserted_id)
            last_saved_cache[device_id] = telemetry_doc.copy()
            print(f"💾 MQTT: Saved telemetry for {device_id}")
        else:
            telemetry_doc["_id"] = "skipped_storage"
            # Still update device last_seen even if we don't save a new record
            db.devices.update_one({"_id": device_id}, {"$set": {"last_seen": timestamp}})
            if len(device_id) == 24:
                db.devices.update_one({"_id": ObjectId(device_id)}, {"$set": {"last_seen": timestamp}})

        telemetry_doc["timestamp"] = timestamp.isoformat()

        # Evaluate alert rules
        try:
            if main_loop and main_loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    evaluate_alerts(None, device_id, telemetry_doc, telemetry_doc.get("tenant_id")),
                    main_loop
                )
        except Exception as e:
            logger.error(f"❌ MQTT: Alert evaluation failed: {e}")

        # Broadcast via WebSocket using the saved main_loop
        try:
            if main_loop and main_loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast({
                        "type": "telemetry",
                        "data": telemetry_doc
                    }), 
                    main_loop
                )
        except Exception as e:
            logger.error(f"❌ MQTT: WebSocket broadcast failed: {e}")

    except Exception as e:
        logger.error(f"❌ MQTT: Error processing message: {e}")

def start_mqtt(loop=None):
    global main_loop
    main_loop = loop

    # Use CallbackAPIVersion.VERSION2 for paho-mqtt 2.x
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message
    
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
        client.loop_start()
        print(f"🚀 MQTT: Service started on {MQTT_BROKER}:{MQTT_PORT}")
        global mqtt_client
        mqtt_client = client
        
        # Start a simple heartbeat to verify connectivity in logs
        async def heartbeat():
            while True:
                client.publish("system/health", json.dumps({"status": "alive", "timestamp": datetime.now().isoformat()}))
                await asyncio.sleep(60)
        
        if main_loop and main_loop.is_running():
            main_loop.create_task(heartbeat())

        return client
    except Exception as e:
        logger.error(f"❌ MQTT: Could not start client: {e}")
        return None
