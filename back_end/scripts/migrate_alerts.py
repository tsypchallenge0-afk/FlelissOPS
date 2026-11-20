from app.database import db

# Target Tenant ID
TENANT_ID = "69e7eb1a5d315fc8c89de16b"

print(f"--- Alert Migration ---")
# 1. Tag alerts missing tenant_id
r = db.alerts.update_many(
    {"tenant_id": {"$exists": False}}, 
    {"$set": {"tenant_id": TENANT_ID}}
)
print(f"Tagged {r.modified_count} alerts with tenant_id: {TENANT_ID}")

# 2. Tag alerts missing house_id (default to the only house we found)
HOUSE_ID = "69a983f28542a169d7f42b72"
r2 = db.alerts.update_many(
    {"house_id": {"$exists": False}},
    {"$set": {"house_id": HOUSE_ID}}
)
print(f"Tagged {r2.modified_count} alerts with house_id: {HOUSE_ID}")

print("--- Migration Complete ---")
