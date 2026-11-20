"""
End-to-end API tests: auth & tenancy, farm → house → device → telemetry → alerts,
flock lifecycle and KPIs, controls, maintenance and super-admin.
Tests in this module share state (IDs created earlier are used later), so they
run top to bottom.
"""
import pytest

from conftest import TENANT_ID

S = {}  # shared IDs between tests


# ── Auth & tenancy ────────────────────────────────────────────────────────

def test_login_rejects_bad_password(anon):
    r = anon.post("/auth/login", json={"username": "admin@example.com", "password": "wrong"})
    assert r.status_code == 401


def test_protected_route_requires_token(anon):
    assert anon.get("/farms").status_code in (401, 403)


def test_register_assigns_real_default_tenant(anon):
    r = anon.post("/auth/register", json={"username": "newbie", "email": "newbie@example.com",
                                          "password": "Newbie-Pass-1", "full_name": "New Bie"})
    assert r.status_code == 200, r.text
    # the new user can actually use tenant-scoped endpoints, under the real tenant _id
    token = r.json()["token"]
    me = anon.get("/auth/me", headers={"Authorization": f"Bearer {token}", "Host": "default.lvh.me"})
    assert me.status_code == 200, me.text
    assert me.json()["tenant_id"] == TENANT_ID


def test_me(admin):
    r = admin.get("/auth/me")
    assert r.status_code == 200 and r.json()["role"] == "admin"


# ── Farm → house → devices ────────────────────────────────────────────────

def test_create_farm(admin):
    r = admin.post("/farms", json={"name": "Test Farm", "location": "Sousse"})
    assert r.status_code in (200, 201), r.text
    S["farm"] = r.json().get("id") or r.json().get("_id")
    assert S["farm"]


def test_create_house(admin):
    r = admin.post(f"/farms/{S['farm']}/houses", json={"farm_id": S["farm"], "name": "House T1", "capacity": 5000})
    assert r.status_code in (200, 201), r.text
    S["house"] = r.json().get("id") or r.json().get("_id")
    houses = admin.get(f"/farms/{S['farm']}/houses").json()
    assert any((h.get("id") or h.get("_id")) == S["house"] for h in houses)


def test_create_sensor_and_heater(admin):
    r = admin.post("/devices", json={"house_id": S["house"], "name": "Sensor Front", "type": "combined",
                                     "position": "Front-Left"})
    assert r.status_code in (200, 201), r.text
    S["sensor"] = r.json().get("id") or r.json().get("_id")
    r = admin.post("/devices", json={"house_id": S["house"], "name": "Heater", "type": "actuator_heater",
                                     "model": "ACTUATOR-NODE"})
    assert r.status_code in (200, 201), r.text
    sensors = admin.get(f"/houses/{S['house']}/sensors").json()
    assert [d for d in sensors if d["_id"] == S["sensor"]]


def test_move_device_position(admin):
    r = admin.patch(f"/devices/{S['sensor']}", json={"x_coord": 0.4, "y_coord": 0.6, "position": "Middle-Center"})
    assert r.status_code == 200, r.text
    d = admin.get(f"/devices/{S['sensor']}").json()
    assert d["x_coord"] == 0.4 and d["position"] == "Middle-Center"


def test_patch_unknown_device_is_404(admin):
    assert admin.patch("/devices/does-not-exist", json={"status": "offline"}).status_code == 404


# ── Telemetry & alerts ────────────────────────────────────────────────────

def test_unauthenticated_sensor_reading_is_tagged(anon, admin):
    r = anon.post("/telemetry/send", json={"device_id": S["sensor"], "temperature": 36.5, "humidity": 60, "ammonia": 8})
    assert r.status_code == 200 and r.json()["stored"], r.text
    rows = admin.get("/telemetry", params={"house_id": S["house"]}).json()
    rows = rows if isinstance(rows, list) else rows.get("data", rows.get("items", []))
    assert rows, "reading should be visible to the tenant (tagged with tenant + house)"


def test_environment_averages_recent_readings(admin):
    env = admin.get(f"/houses/{S['house']}/environment").json()
    assert env["internal"]["avg_temperature"] == pytest.approx(36.5, abs=0.1)


def test_danger_alert_created(admin):
    alerts = admin.get("/telemetry/alerts", params={"house_id": S["house"]}).json()
    alerts = alerts if isinstance(alerts, list) else alerts.get("alerts", [])
    danger = [a for a in alerts if a.get("metric") == "temperature" and a.get("severity") == "danger"]
    assert danger, alerts
    S["alert"] = danger[0].get("id") or danger[0].get("_id")


def test_simulator_reading_by_house_is_tagged(anon, admin):
    r = anon.post("/telemetry", json={"house_id": S["house"], "temperature": 28, "humidity": 60, "ammonia": 5})
    assert r.status_code == 201, r.text
    from app.database import db
    assert db.telemetry.find_one({"house_id": S["house"], "temperature": 28})["tenant_id"] == TENANT_ID


def test_acknowledge_alert(admin):
    r = admin.patch(f"/telemetry/alerts/{S['alert']}", json={"status": "acknowledged"})
    assert r.status_code == 200, r.text


# ── Flock lifecycle & KPIs ────────────────────────────────────────────────

def test_create_flock(admin):
    r = admin.post("/flocks", json={"house_id": S["house"], "placement_count": 5000, "breed": "Ross 308"})
    assert r.status_code in (200, 201), r.text
    S["flock"] = r.json().get("id") or r.json().get("_id")


def test_flock_entries_and_kpis(admin):
    assert admin.post(f"/flocks/{S['flock']}/entries", json={"entry_type": "weight", "value": 180, "day": 7}).status_code in (200, 201)
    assert admin.post(f"/flocks/{S['flock']}/entries", json={"entry_type": "feed", "value": 700, "day": 7}).status_code in (200, 201)
    r = admin.post(f"/flocks/{S['flock']}/mortality", json={"count": 10, "reason": "test"})
    assert r.status_code in (200, 201), r.text
    k = admin.get(f"/flocks/{S['flock']}/kpis").json()
    assert k["total_mortality"] == 10 and k["mortality_rate"] == 0.2
    assert k["latest_weight_g"] == 180 and k["fcr"] is not None


def test_curve_templates_route_not_shadowed(admin):
    assert admin.get("/flocks/curve-templates").status_code == 200


# ── Controls ──────────────────────────────────────────────────────────────

def test_manual_controls(admin):
    # same payloads the House Control page sends
    r = admin.post(f"/houses/{S['house']}/controls/heater/activate", json={"active": True, "operator_id": "admin"})
    assert r.status_code == 200, r.text
    r = admin.patch(f"/houses/{S['house']}/controls/fans", json={"speed_percent": 60, "operator_id": "admin"})
    assert r.status_code == 200, r.text
    r = admin.patch(f"/houses/{S['house']}/controls/heater", json={"target_temp": 31, "operator_id": "admin"})
    assert r.status_code == 200, r.text
    assert admin.get(f"/houses/{S['house']}/controls").status_code == 200


# ── Maintenance ───────────────────────────────────────────────────────────

def test_work_order_lifecycle(admin):
    r = admin.post("/maintenance/workorders", json={
        "farm_id": S["farm"], "house_id": S["house"], "device_id": S["sensor"], "category": "sensor",
        "description": "Recalibrate", "priority": "medium", "created_by": "admin"})
    assert r.status_code in (200, 201), r.text
    oid = r.json().get("id") or r.json().get("_id")
    assert admin.patch(f"/maintenance/workorders/{oid}", json={"status": "completed"}).status_code == 200


# ── Super admin ───────────────────────────────────────────────────────────

def test_super_admin_sees_platform(superadmin):
    assert superadmin.get("/super-admin/platform/stats").status_code == 200
    tenants = superadmin.get("/super-admin/tenants").json()
    tenants = tenants if isinstance(tenants, list) else tenants.get("tenants", [])
    assert any(t.get("subdomain") == "default" for t in tenants)


def test_tenant_admin_cannot_use_super_admin_api(admin):
    assert admin.get("/super-admin/tenants").status_code in (401, 403)


# ── Dashboards show real data (no placeholder numbers) ────────────────────

def test_farm_overview_metrics_null_without_recent_data(admin):
    r = admin.post("/farms", json={"name": "Empty Farm", "location": "Nowhere"})
    empty_id = r.json().get("id") or r.json().get("_id")
    admin.post(f"/farms/{empty_id}/houses", json={"name": "Empty House"})
    farms = {f["id"]: f for f in admin.get("/farms").json()}
    assert farms[empty_id]["temp_min"] is None and farms[empty_id]["ammonia_peak"] is None
    assert farms[S["farm"]]["temp_max"] is not None      # has readings from earlier tests


def test_analytics_comparison_has_real_kpi_fields(admin):
    rows = {r["farm_id"]: r for r in admin.get("/analytics/farms/comparison").json()}
    row = rows[S["farm"]]
    for key in ("avg_temperature", "avg_mortality", "birds_placed", "birds_dead",
                "devices_online", "device_count", "ai_commands", "total_commands"):
        assert key in row, key
    assert row["birds_placed"] == 5000 and row["birds_dead"] >= 10
    assert row["avg_temperature"] is not None


def test_sensor_without_heartbeat_is_offline(admin):
    r = admin.post("/devices", json={"house_id": S["house"], "name": "Silent", "type": "combined"})
    dev = r.json().get("id") or r.json().get("_id")
    assert admin.get(f"/devices/{dev}").json()["status"] == "offline"
    # the sensor that reported earlier is online
    assert admin.get(f"/devices/{S['sensor']}").json()["status"] == "online"


# ── Alert storms, silencing and AI safety ─────────────────────────────────

def test_persistent_breach_does_not_flood_alerts(anon, admin):
    from app.database import db
    r = admin.post("/devices", json={"house_id": S["house"], "name": "Hot Corner", "type": "combined"})
    dev = r.json().get("id") or r.json().get("_id")
    for t in (36.0, 36.5, 37.0, 37.2):
        anon.post("/telemetry/send", json={"device_id": dev, "temperature": t, "humidity": 60, "ammonia": 5})
    danger = list(db.alerts.find({"device_id": dev, "type": "temperature_danger"}))
    assert len(danger) == 1, "one open alert per condition"
    assert danger[0]["occurrences"] >= 2 and danger[0]["value"] in (37.0, 37.2)
    S["hot_dev"], S["hot_alert"] = dev, danger[0]["_id"]


def test_silence_alert_is_real(anon, admin):
    from app.database import db
    r = admin.post(f"/telemetry/alerts/{S['hot_alert']}/silence", json={"duration_minutes": 30})
    assert r.status_code == 200 and "silenced_until" in r.json()
    db.alerts.update_one({"_id": S["hot_alert"]}, {"$set": {"status": "resolved"}})
    anon.post("/telemetry/send", json={"device_id": S["hot_dev"], "temperature": 38.5, "humidity": 60, "ammonia": 5})
    assert db.alerts.count_documents({"device_id": S["hot_dev"], "type": "temperature_danger"}) == 1, "silenced → no new alert"


def test_ai_uses_measured_breach_when_no_forecast_yet(admin):
    # The house has only seconds of history: no forecast, but a measured breach must still cool.
    from app.ai.control_loop import evaluate_predictions
    decisions = evaluate_predictions(S["house"], {"predictions": {}})
    fan = [d for d in decisions if d.device_type == "fan"]
    assert fan and fan[0].payload["running"] is True and fan[0].payload["speed_percent"] >= 60


def test_ai_does_not_act_blind_without_data(admin):
    from app.ai.control_loop import evaluate_predictions
    r = admin.post(f"/farms/{S['farm']}/houses", json={"name": "No Sensors"})
    empty_house = r.json().get("id") or r.json().get("_id")
    decisions = evaluate_predictions(empty_house, {"predictions": {}})
    assert not [d for d in decisions if d.device_type in ("fan", "heater")], "no climate commands without data"


def test_demo_scenario_endpoints(admin, anon):
    hid = S["house"]
    assert admin.get(f"/houses/{hid}/demo/status").json()["state"] == "idle"
    r = admin.post(f"/farms/{S['farm']}/houses", json={"name": "Bare"})
    bare = r.json().get("id") or r.json().get("_id")
    assert admin.post(f"/houses/{bare}/demo/heat-stress").status_code == 400      # no sensors
    assert admin.post("/houses/does-not-exist/demo/heat-stress").status_code == 404
