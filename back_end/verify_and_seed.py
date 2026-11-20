import sys
import uuid
import os

try:
    from app.main import app
    print("FastAPI app imported successfully! Syntax and imports are clean.")
except Exception as e:
    print(f"Failed to import app: {e}")
    sys.exit(1)

from app.database import db

def seed_rules():
    rules = [
        {"scope": "global", "metric": "temperature", "warn_threshold": 32.0, "danger_threshold": 35.0},
        {"scope": "global", "metric": "humidity", "warn_threshold": 75.0, "danger_threshold": 85.0},
        {"scope": "global", "metric": "ammonia", "warn_threshold": 15.0, "danger_threshold": 25.0}
    ]
    
    for r in rules:
        existing = db.alert_rules.find_one({"scope": "global", "metric": r["metric"]})
        if not existing:
            r["_id"] = str(uuid.uuid4())
            r["enabled"] = True
            db.alert_rules.insert_one(r)
            print(f"Seeded rule: {r['metric']}")
        else:
            print(f"Rule already exists: {r['metric']}")

if __name__ == "__main__":
    seed_rules()
    print("Seeding complete.")
