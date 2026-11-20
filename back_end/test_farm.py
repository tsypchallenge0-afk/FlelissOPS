from app.database import db
from bson.objectid import ObjectId
from bson.errors import InvalidId

farm_id = '69a983f28542a169d7f42b71'
f = None
try:
    print(f"Trying ObjectId: {farm_id}")
    f = db.farms.find_one({"_id": ObjectId(farm_id)})
except InvalidId as e:
    print(f"InvalidId Error: {e}")

print('After try:', f)

if not f:
    f = db.farms.find_one({"_id": farm_id})
    print('After string fallback:', f)
