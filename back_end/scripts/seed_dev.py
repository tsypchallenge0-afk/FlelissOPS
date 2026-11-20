"""
Development / demo seed for AviFarm. Safe to re-run (idempotent).

Creates, if missing:
  * the 'default' tenant (reached at http://default.lvh.me:5173)
  * global alert rules (temperature / humidity / ammonia)
  * a platform super admin and a tenant admin for 'default'
  * the farms, houses and devices that simulator/config.py streams data for

With --demo it also places an active flock in every 'default' house that has none,
with realistic history (weekly weigh-ins near the breed standard, daily feed and
normal early mortality) so the Health tab, KPIs and analytics have something to show.

Passwords come from SEED_SUPERADMIN_PASSWORD / SEED_ADMIN_PASSWORD, otherwise a strong
random one is generated and printed once. Existing users are never modified unless
--reset-passwords is given.

Usage (from back_end/):
    python -m scripts.seed_dev            # base data
    python -m scripts.seed_dev --demo     # + demo flocks
"""
import argparse
import os
import random
import secrets
import string
import uuid
from datetime import datetime, timedelta

from bson import ObjectId

from app.auth.service import hash_password
from app.database import db
from app.flock.standards import get_standard_weight
from simulator.config import HOUSES, HOUSE_DEVICES

SUPERADMIN = {"username": "superadmin", "email": os.getenv("SEED_SUPERADMIN_EMAIL", "superadmin@example.com")}
ADMIN = {"username": os.getenv("SEED_ADMIN_EMAIL", "admin@test.com"), "email": os.getenv("SEED_ADMIN_EMAIL", "admin@test.com")}


def _password(env_name: str) -> str:
    return os.getenv(env_name) or "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16))


def ensure_tenant() -> str:
    t = db.tenants.find_one({"subdomain": "default"})
    if t:
        return str(t["_id"])
    oid = ObjectId()
    db.tenants.insert_one({
        "_id": oid, "tenant_id": "default", "company_name": "Default System", "subdomain": "default",
        "status": "active", "plan": "custom",
        "plan_details": {"max_farms": -1, "max_houses": -1, "max_devices": -1, "max_users": -1},
        "branding": {"primary_color": "#e64500"}, "created_at": datetime.utcnow().isoformat(),
    })
    print(f"+ tenant 'default' ({oid})")
    return str(oid)


def ensure_alert_rules():
    for metric, warn, danger in (("temperature", 32.0, 35.0), ("humidity", 75.0, 85.0), ("ammonia", 15.0, 25.0)):
        res = db.alert_rules.update_one(
            {"scope": "global", "metric": metric},
            {"$setOnInsert": {"_id": str(uuid.uuid4()), "warn_threshold": warn, "danger_threshold": danger, "enabled": True}},
            upsert=True)
        if res.upserted_id:
            print(f"+ alert rule {metric}")


def ensure_user(spec: dict, role: str, tenant_id, env_pw: str, reset: bool):
    existing = db.users.find_one({"$or": [{"username": spec["username"]}, {"email": spec["email"]}]})
    if existing and not reset:
        print(f"= {role} '{existing['username']}' exists (password unchanged)")
        return
    pw = _password(env_pw)
    if existing:
        db.users.update_one({"_id": existing["_id"]}, {"$set": {"password": hash_password(pw), "is_active": True}})
        print(f"~ {role} '{existing['username']}' password reset -> {pw}")
        return
    db.users.insert_one({
        "_id": str(uuid.uuid4()), "username": spec["username"], "email": spec["email"],
        "password": hash_password(pw), "role": role, "full_name": role.replace("_", " ").title(),
        "tenant_id": tenant_id, "is_active": True, "created_at": datetime.utcnow().isoformat(),
    })
    print(f"+ {role} '{spec['username']}' password -> {pw}")


def ensure_simulator_topology(tenant_id: str):
    now = datetime.utcnow().isoformat()
    for fid in sorted({h.farm_id for h in HOUSES}):
        res = db.farms.update_one({"_id": fid}, {"$setOnInsert": {
            "name": f"Simulated Farm {fid[-2:]}", "location": "Simulator",
            "house_count": sum(h.farm_id == fid for h in HOUSES),
            "created_at": now, "updated_at": now, "tenant_id": tenant_id}}, upsert=True)
        if res.upserted_id:
            print(f"+ farm {fid}")
    positions = ["Front-Center", "Back-Center"]
    for h in HOUSES:
        res = db.houses.update_one({"_id": h.house_id}, {"$setOnInsert": {
            "name": h.house_code, "house_code": h.house_id, "capacity": h.capacity, "farm_id": h.farm_id,
            "created_at": now, "updated_at": now, "tenant_id": tenant_id}}, upsert=True)
        if res.upserted_id:
            print(f"+ house {h.house_id}")
        for i, dev in enumerate(HOUSE_DEVICES.get(h.house_id, [])):
            db.devices.update_one({"_id": dev}, {"$setOnInsert": {
                "house_id": h.house_id, "name": f"Sim Sensor {dev}", "type": "combined", "model": "SIMULATED",
                "status": "online", "position": positions[i % len(positions)], "last_seen": None,
                "tenant_id": tenant_id}}, upsert=True)


def seed_demo_flocks(tenant_id: str):
    """Active flock + history for every tenant house that has no active flock."""
    sim_ages = {h.house_id: h.age_days for h in HOUSES}
    rng = random.Random(42)
    for house in db.houses.find({"tenant_id": tenant_id}):
        hid = str(house["_id"])
        if db.flocks.find_one({"house_id": hid, "status": "active"}):
            continue
        age = sim_ages.get(hid, 18)
        placed = (datetime.utcnow() - timedelta(days=age)).replace(hour=6, minute=0, second=0, microsecond=0)
        birds = int(house.get("capacity") or 5000)
        code = house.get("house_code") or hid[-4:]
        flock_oid = ObjectId()
        db.flocks.insert_one({
            "_id": flock_oid, "house_id": hid, "farm_id": house.get("farm_id"),
            "flock_id": f"FLOCK-{placed:%Y}-{code}-01", "breed": "Ross 308",
            "placement_date": placed.isoformat(), "placement_count": birds,
            "target_weight_g": 2500.0, "target_age_days": 42, "status": "active",
            "created_by": "seed", "created_at": placed.isoformat(), "tenant_id": tenant_id,
        })
        fid = str(flock_oid)
        entries, deaths, alive = [], [], birds
        for day in range(1, age + 1):
            ts = placed + timedelta(days=day, hours=8)
            # normal broiler mortality: higher in week 1, then ~0.03-0.05 %/day
            rate = 0.0012 if day <= 7 else 0.0004
            dead = sum(rng.random() < rate for _ in range(alive)) if alive < 20000 else int(alive * rate)
            if dead:
                alive -= dead
                deaths.append({"flock_id": fid, "house_id": hid, "detected_at": ts, "day": day, "count": dead,
                               "source": "manual", "confidence": 1.0, "acknowledged": True,
                               "auto_confirmed": True, "tenant_id": tenant_id})
            intake_g = min(200.0, 15 + 4.3 * day)            # per bird per day
            entries.append({"flock_id": fid, "house_id": hid, "entry_type": "feed", "day": day,
                            "value": round(alive * intake_g / 1000, 1), "sample_size": alive,
                            "recorded_at": ts.isoformat(), "notes": "seed", "recorded_by": "seed", "tenant_id": tenant_id})
            if day % 7 == 0 or day == age:
                w = get_standard_weight("Ross 308", day) * rng.uniform(0.95, 1.04)
                entries.append({"flock_id": fid, "house_id": hid, "entry_type": "weight", "day": day,
                                "value": round(w), "sample_size": 50,
                                "recorded_at": ts.isoformat(), "notes": "seed weigh-in", "recorded_by": "seed", "tenant_id": tenant_id})
        if entries:
            db.flock_entries.insert_many(entries)
        if deaths:
            db.mortality_events.insert_many(deaths)
        print(f"+ demo flock in {house.get('name') or hid}: day {age}, {birds} placed, "
              f"{birds - alive} dead, {len(entries)} entries")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--demo", action="store_true", help="also create demo flocks with history")
    ap.add_argument("--reset-passwords", action="store_true", help="reset passwords of the seed users")
    args = ap.parse_args()

    print(f"Seeding database '{db.name}'")
    tenant_id = ensure_tenant()
    ensure_alert_rules()
    ensure_user(SUPERADMIN, "super_admin", None, "SEED_SUPERADMIN_PASSWORD", args.reset_passwords)
    ensure_user(ADMIN, "admin", tenant_id, "SEED_ADMIN_PASSWORD", args.reset_passwords)
    ensure_simulator_topology(tenant_id)
    if args.demo:
        seed_demo_flocks(tenant_id)
    print("Done. Super admin: http://super.lvh.me:5173  |  Tenant: http://default.lvh.me:5173")


if __name__ == "__main__":
    main()
