import os
import random
from datetime import datetime, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

# Load env for MONGO_URL
load_dotenv()
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
client = MongoClient(MONGO_URL)
db = client["poultry_db"]

def seed_telemetry(house_id, days=30):
    print(f"Ensuring house {house_id} exists in DB...")
    db.houses.update_one(
        {"_id": house_id},
        {"$set": {"name": f"House {house_id[-4:]}", "created_at": datetime.utcnow()}},
        upsert=True
    )
    
    device_id = f"snsr-{house_id[-4:]}"
    print(f"Ensuring device {device_id} exists in DB...")
    db.devices.update_one(
        {"_id": device_id},
        {"$set": {
            "house_id": house_id,
            "name": f"Main Sensor {house_id[-4:]}",
            "type": "environmental",
            "category": "sensor",
            "status": "online",
            "last_seen": datetime.utcnow()
        }},
        upsert=True
    )

    print(f"Seeding {days} days of data for house: {house_id}")
    
    # Clear existing data for this house (optional, but cleaner for testing)
    # db.telemetry.delete_many({"device_id": device_id})
    
    start_date = datetime.utcnow() - timedelta(days=days)
    current_time = start_date
    
    records = []
    
    # Base values
    base_temp = 28.0
    base_hum = 65.0
    base_nh3 = 12.0
    
    while current_time < datetime.utcnow():
        # Add some seasonality (diurnal cycle)
        hour = current_time.hour
        # Temp peaks at 14:00, lowest at 02:00
        temp = base_temp + random.uniform(-0.5, 0.5) + (2.0 if 10 <= hour <= 18 else -1.0)
        
        hum = base_hum + random.uniform(-2.0, 2.0)
        nh3 = base_nh3 + random.uniform(-1.0, 1.0)
        
        # Occasional "anomaly" (every ~500 points)
        if random.random() < 0.002:
            temp += 10.0
            print(f"  Inserted anomaly at {current_time}")

        records.append({
            "device_id": device_id,
            "timestamp": current_time,
            "temperature": round(temp, 2),
            "humidity": round(hum, 2),
            "ammonia": round(nh3, 2)
        })
        
        # Next point (every 1 minute to match AviFarm default sampling)
        current_time += timedelta(minutes=1)
        
        # Batch insert every 5000 records to avoid memory issues
        if len(records) >= 5000:
            db.telemetry.insert_many(records)
            records = []
            print(f"  Progress: {current_time.strftime('%Y-%m-%d %H:%M')}")

    if records:
        db.telemetry.insert_many(records)
        
    print("Seeding complete!")

if __name__ == "__main__":
    # You can change this ID to match your test house
    TEST_HOUSE_ID = "69a98e8aeefc9142325c2794" 
    seed_telemetry(TEST_HOUSE_ID)
