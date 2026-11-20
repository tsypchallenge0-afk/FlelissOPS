# AviFarm · FlelissOPS — Smart Poultry Management System

AviFarm (dashboard brand: **FlelissOPS**) is an IoT + AI platform for commercial poultry houses. ESP32 sensor nodes stream temperature, humidity and ammonia over MQTT; a FastAPI backend stores them in MongoDB, forecasts and detects anomalies, and runs a closed control loop over fans, heaters, lighting and feeders. A multi-tenant React dashboard serves each client on its own sub-domain, with a separate super-admin console.

![Stack](https://img.shields.io/badge/Stack-React%2019%20%7C%20FastAPI%20%7C%20MongoDB%20%7C%20MQTT-blue)
![Tests](https://img.shields.io/badge/API%20tests-pytest-brightgreen)

---

## Architecture

```text
 ESP32 + DHT22 + MQ-135 ──MQTT──►  Mosquitto  ──►┐
 Simulators (HTTP) ─────────────────────────────►├── FastAPI backend (:9000)        React dashboard (:5173)
                                                 │   telemetry · alerts · AI ──WS──► <tenant>.lvh.me
                                                 │   control loop · flocks           super.lvh.me (super admin)
 Actuator ESP32 (fans/heater/…) ◄──MQTT commands─┘          │
                                                        MongoDB
```

| Layer | Tech | Code |
|---|---|---|
| Hardware | ESP32, DHT22, MQ-135, actuator node | [`hardware/`](hardware/) |
| Messaging | MQTT (Mosquitto), WebSockets | [`mosquitto/`](mosquitto/), [`back_end/app/core/mqtt.py`](back_end/app/core/mqtt.py) |
| Backend | FastAPI, PyMongo, APScheduler | [`back_end/app/`](back_end/app/) |
| AI | Prophet forecasting, Isolation-Forest anomalies, rule/AI control loop | [`back_end/app/ai/`](back_end/app/ai/) |
| Frontend | React 19, Vite, Recharts, dnd-kit | [`poultry-dashboard/`](poultry-dashboard/) |

## Features

- **Command Center & House Control** — live gauges (temperature, humidity, ammonia, heat-stress index THI), alerts, manual/AI control of fans, heater, lighting and feeder.
- **Spatial view** — cut-away 3-D house with every sensor at its installed position, an interpolated floor heat-map (temperature / humidity / NH₃), live equipment state, and drag-to-reposition sensors.
- **Flock management** — placements, weigh-ins, feed, mortality; KPIs: mortality %, FCR, weight vs breed standard (Ross 308 / Cobb 500), EPEF; age-based setpoint curves.
- **Health score** — weighted from temperature vs age target, ammonia and survival.
- **AI** — Prophet forecasts, Isolation-Forest anomaly detection, autonomous control loop with a decision log (AI automation rate is measured, not assumed).
- **Analytics & reports** — farm comparison, efficiency, alert patterns, PDF reports and scheduled e-mail reports.
- **Multi-tenancy** — each client on `<subdomain>.lvh.me`, plan quotas, invitations, super-admin console.

---

## Quick start (local)

**Prerequisites:** Docker Desktop, Python 3.11+ (verified on 3.14), Node.js 18+ (verified on 24).

### 1. Infrastructure (MongoDB, Mongo Express, Mosquitto)
```bash
docker compose up -d
```
MongoDB `:27017` (user `admin` / `password`), Mongo Express http://localhost:8081, MQTT `:1883`.

### 2. Backend
```bash
cd back_end
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt   # includes PyTorch — large download
copy .env.example .env            # macOS/Linux: cp .env.example .env
uvicorn app.main:app --reload --port 9000
```
API docs: http://localhost:9000/docs. The port must be **9000** — the frontend proxies `/api` there.

### 3. Seed data
```bash
cd back_end
python -m scripts.seed_dev --demo
```
Creates the `default` tenant, alert rules, a **super admin** (`superadmin`) and a **tenant admin** (`admin@test.com`) — the generated passwords are printed once (or set `SEED_SUPERADMIN_PASSWORD` / `SEED_ADMIN_PASSWORD` first). `--demo` adds the simulator's farms/houses/sensors and an active flock with realistic history in every house. Safe to re-run; existing users are left untouched (`--reset-passwords` to change that).

### 4. Frontend
```bash
cd poultry-dashboard
copy .env.example .env
npm install
npm run dev
```

### 5. Open it
| URL | What |
|---|---|
| http://default.lvh.me:5173 | Tenant dashboard (`admin@test.com`) |
| http://super.lvh.me:5173 | Super-admin console (`superadmin`) |
| http://localhost:9000/docs | API |

> The tenant comes from the sub-domain, so use `*.lvh.me`, not `localhost`. `lvh.me` resolves to 127.0.0.1 through **public DNS** — for an offline demo add these lines to `C:\Windows\System32\drivers\etc\hosts` (or `/etc/hosts`):
> ```
> 127.0.0.1  lvh.me default.lvh.me super.lvh.me
> ```
> plus one line per extra tenant sub-domain. Fonts are bundled, so the UI looks identical offline.

### 6. Live data without hardware
```bash
cd back_end
python -m simulator.runner --live      # one reading per simulated sensor per minute
python -m simulator.runner --backfill  # 21 days of history (for AI training/analytics)
```

### 7. Heat-stress demo (about 1 minute)
Open a house → **▶ HEAT-STRESS DEMO** (supervisor/admin). The backend replays a heat wave on that house's real sensors; everything else is the production pipeline: readings are stored and broadcast, alert rules fire (one alert per condition, no flood), the AI decision function runs on the stored data and its commands go out exactly like the 30-second control loop (actuator state, audit log, WebSocket, MQTT to the hardware). The panel shows the phases, peak temperature, alerts and the **measured breach → AI-command latency**. If the fans are in MANUAL mode the AI is, correctly, not allowed to override them. Demo readings are tagged `source: "demo_scenario"`. API: `POST /houses/{id}/demo/heat-stress`, `GET /houses/{id}/demo/status`.

---

## Tests

```bash
cd back_end
pip install -r requirements-dev.txt
set MONGO_URL=mongodb://admin:password@127.0.0.1:27017/?authSource=admin   # export on macOS/Linux
python -m pytest
```
The suite ([`back_end/tests/`](back_end/tests/)) runs against a throw-away `poultry_test` database (created and dropped automatically — it refuses to run against any database not ending in `_test`) and covers auth & tenant isolation, farm → house → device → telemetry → alert flow, flock KPIs, controls, maintenance and super-admin access.

Frontend: `cd poultry-dashboard && npm run lint && npm run build`.

---

## Hardware (MQTT)

**Sensor node** — [`hardware/sensor_node_esp32/`](hardware/sensor_node_esp32/)
- DHT22 (temperature/humidity) on GPIO 4, MQ-135 (ammonia) on GPIO 34.
- Libraries: `DHT sensor library`, `PubSubClient`, `ArduinoJson`.
- Set `ssid`, `password` and `mqtt_server` (the PC's LAN IP) in the `.ino`.

Publish JSON to topic `telemetry/send`:
```json
{ "device_id": "69aac9a67dee4c1c93b052ee", "temperature": 28.5, "humidity": 65.0, "ammonia": 12.4 }
```
The backend looks the device up, tags the reading with its tenant and house, marks it online and evaluates alert rules. Unknown device IDs are listed as discovered devices and can be adopted in the device registration drawer. A sensor that has not reported for 15 minutes is shown offline.

**Actuator node** — [`hardware/actuator_node_esp32/`](hardware/actuator_node_esp32/) receives control commands over MQTT.

**PCBs (revision 2.0, KiCad 9)** — schematics, board layouts, 3D renders and ready-to-order Gerbers for both nodes are in [`hardware/pcb/`](hardware/pcb/); see [`hardware/README.md`](hardware/README.md) for the parts list and notes.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Backend: `Authentication failed` from MongoDB on Windows | A local **MongoDB Windows service** also listens on `127.0.0.1:27017` and wins over Docker. Use `MONGO_URL=mongodb://admin:password@[::1]:27017/?authSource=admin` (the default in `.env.example`), or stop the service (`net stop MongoDB`). |
| `Tenant "default" not found` | Open the app on `default.lvh.me`, and run the seed script. |
| Page does not load when offline | Add the hosts-file entries above. |
| `pip install` fails on numpy/pandas | Use the pinned `requirements.txt` (old pins do not support Python 3.13+). |
| Warning `JWT_SECRET is not set` | Set `JWT_SECRET` in `back_end/.env`. |

---

## Project structure

```text
back_end/
  app/            FastAPI routers (auth, farms, houses, devices, telemetry, alerts, flock, ai, control, analytics, reports, tenants)
  simulator/      physics-based sensor simulator
  scripts/        seed_dev.py and maintenance scripts
  tests/          pytest API suite
poultry-dashboard/
  src/pages       Command Center, House Control, Flock, Analytics, Devices, Alerts, Maintenance, Admin, super-admin
  src/components  gauges, spatial FloorPlanView, health dashboard, curve editor …
  src/lib         API client, tenant helpers, shared constants
hardware/         ESP32 firmware (sensor & actuator nodes)
mosquitto/        broker config
```

## License
Proprietary. All rights reserved.
