"""
Test fixtures for the AviFarm API.

The suite runs against a throw-away database (`poultry_test` by default) on the
MongoDB given by MONGO_URL, so it never touches real data. The app's lifespan
(MQTT, schedulers) is not started — only the HTTP layer is exercised.

    cd back_end
    set MONGO_URL=mongodb://admin:password@127.0.0.1:27017/?authSource=admin
    python -m pytest
"""
import os
import uuid
from datetime import datetime

import pytest

os.environ["DATABASE_NAME"] = os.environ.get("TEST_DATABASE_NAME", "poultry_test")

from bson import ObjectId                    # noqa: E402
from fastapi.testclient import TestClient    # noqa: E402

from app.database import db, client as mongo_client   # noqa: E402
from app.auth.service import hash_password            # noqa: E402
from app.main import app                              # noqa: E402

assert db.name.endswith("_test"), f"Refusing to run tests against non-test database '{db.name}'"

TENANT_OID = ObjectId()
TENANT_ID = str(TENANT_OID)
ADMIN = {"email": "admin@example.com", "password": "Admin-Pass-123"}
SUPER = {"email": "super@example.com", "password": "Super-Pass-123"}


@pytest.fixture(scope="session", autouse=True)
def seeded_db():
    mongo_client.drop_database(db.name)
    now = datetime.utcnow().isoformat()
    db.tenants.insert_one({
        "_id": TENANT_OID, "tenant_id": "default", "company_name": "Test Co", "subdomain": "default",
        "status": "active", "plan": "custom",
        "plan_details": {"max_farms": -1, "max_houses": -1, "max_devices": -1, "max_users": -1},
        "created_at": now,
    })
    for u, role, tenant in ((ADMIN, "admin", TENANT_ID), (SUPER, "super_admin", None)):
        db.users.insert_one({
            "_id": str(uuid.uuid4()), "username": u["email"], "email": u["email"],
            "password": hash_password(u["password"]), "role": role, "full_name": role,
            "tenant_id": tenant, "is_active": True, "created_at": now,
        })
    for metric, warn, danger in (("temperature", 32, 35), ("humidity", 75, 85), ("ammonia", 15, 25)):
        db.alert_rules.insert_one({"_id": str(uuid.uuid4()), "scope": "global", "metric": metric,
                                   "warn_threshold": warn, "danger_threshold": danger, "enabled": True})
    yield
    mongo_client.drop_database(db.name)


def _client(host: str) -> TestClient:
    # Tenancy is resolved from the Host header (subdomain), like in the browser.
    return TestClient(app, base_url=f"http://{host}")


def _login(c: TestClient, creds: dict) -> TestClient:
    r = c.post("/auth/login", json={"username": creds["email"], "password": creds["password"]})
    assert r.status_code == 200, r.text
    c.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return c


@pytest.fixture(scope="session")
def admin():
    """Tenant admin on default.lvh.me."""
    return _login(_client("default.lvh.me"), ADMIN)


@pytest.fixture(scope="session")
def superadmin():
    """Platform super admin on super.lvh.me."""
    return _login(_client("super.lvh.me"), SUPER)


@pytest.fixture(scope="session")
def anon():
    """Unauthenticated client (sensors, simulators)."""
    return _client("127.0.0.1")
