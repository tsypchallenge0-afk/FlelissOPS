import sys
import uuid
from app.database import db

def seed_basic_data():
    # Create a test farm
    farm_data = {
        "_id": "69a983f28542a169d7f42b71",
        "name": "Smart Poultry Farm",
        "location": "Sousse",
        "owner_id": "admin@test.com"
    }
    
    existing_farm = db.farms.find_one({"_id": farm_data["_id"]})
    if not existing_farm:
        db.farms.insert_one(farm_data)
        print(f"Seeded farm: {farm_data['name']}")
    else:
        print(f"Farm already exists: {farm_data['name']}")
    
    # Create a test house
    house_data = {
        "_id": "69a983f28542a169d7f42b72",
        "name": "House 1",
        "farm_id": "69a983f28542a169d7f42b71",
        "type": "broiler"
    }
    
    existing_house = db.houses.find_one({"_id": house_data["_id"]})
    if not existing_house:
        db.houses.insert_one(house_data)
        print(f"Seeded house: {house_data['name']}")
    else:
        print(f"House already exists: {house_data['name']}")
    
    # Seed alert rules
    rules = [
        {"_id": str(uuid.uuid4()), "scope": "global", "metric": "temperature", "warn_threshold": 32.0, "danger_threshold": 35.0, "enabled": True},
        {"_id": str(uuid.uuid4()), "scope": "global", "metric": "humidity", "warn_threshold": 75.0, "danger_threshold": 85.0, "enabled": True},
        {"_id": str(uuid.uuid4()), "scope": "global", "metric": "ammonia", "warn_threshold": 15.0, "danger_threshold": 25.0, "enabled": True}
    ]
    
    for r in rules:
        existing = db.alert_rules.find_one({"scope": "global", "metric": r["metric"]})
        if not existing:
            db.alert_rules.insert_one(r)
            print(f"Seeded rule: {r['metric']}")
        else:
            print(f"Rule already exists: {r['metric']}")

if __name__ == "__main__":
    seed_basic_data()
    print("Basic data seeding completed!")
