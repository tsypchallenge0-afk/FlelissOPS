from app.database import db

# 1. Find an active alert
alert = db.alerts.find_one({"status": "active"})

if not alert:
    print("No active alerts found to test with.")
else:
    alert_id = alert["_id"]
    print(f"Testing acknowledgment for alert ID: {alert_id}")
    print(f"Initial status: {alert.get('status')}")

    # 2. Simulate acknowledgment
    result = db.alerts.update_one(
        {"_id": alert_id}, 
        {"$set": {"status": "acknowledged"}}
    )

    if result.modified_count > 0:
        updated = db.alerts.find_one({"_id": alert_id})
        print(f"Update SUCCESS. New status: {updated.get('status')}")
    else:
        print("Update FAILED. No document was modified.")

# 3. Check if any 'acknowledged' alerts exist
ack_count = db.alerts.count_documents({"status": "acknowledged"})
print(f"Total acknowledged alerts in DB: {ack_count}")
