from app.database import db
from bson import ObjectId

def run():
    print("Starting maintenance: Tagging discovered devices as 'combined'...")
    try:
        result = db.discovered_devices.update_many(
            {}, 
            {"$set": {"type": "combined"}}
        )
        print(f"Success! Updated {result.modified_count} discovered devices.")
        
        # Also update any existing registered devices that might have been created without a type
        result_reg = db.devices.update_many(
            {"type": {"$exists": False}},
            {"$set": {"type": "combined"}}
        )
        print(f"Success! Updated {result_reg.modified_count} registered devices that were missing a type.")
        
    except Exception as e:
        print(f"Error during update: {e}")

if __name__ == "__main__":
    run()
