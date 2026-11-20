from app.database import db

def run():
    print("Updating physical node to combined type...")
    result = db.devices.update_one(
        {"_id": "69aac9a67dee4c1c93b052ee"}, 
        {"$set": {"type": "combined"}}
    )
    if result.modified_count > 0:
        print("✅ Success! Physical node updated.")
    else:
        print("ℹ️ Physical node was already updated or not found with that ID.")

if __name__ == "__main__":
    run()
