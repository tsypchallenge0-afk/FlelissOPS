from dataclasses import dataclass, field
from typing import List, Dict

@dataclass
class HouseProfile:
    house_id: str
    farm_id: str
    house_code: str
    capacity: int               # number of birds — affects ammonia baseline
    age_days: int = 0           # flock age — older flocks produce more ammonia
    ventilation_quality: float = 1.0  # 0.5 = poor, 1.0 = normal, 1.5 = excellent
    insulation_quality: float  = 1.0  # affects temperature stability

# ── Define your farm topology here ──────────────────────────────────────────
# Match house_id and farm_id values to what's already in your farms/houses tables.
# If those tables are empty, seed them first or add the IDs you want to use.

HOUSES: List[HouseProfile] = [
    HouseProfile(
        house_id='HSE-A1', farm_id='FARM-01',
        house_code='House A1', capacity=5000,
        age_days=12, ventilation_quality=1.0, insulation_quality=1.0,
    ),
    HouseProfile(
        house_id='HSE-A2', farm_id='FARM-01',
        house_code='House A2', capacity=4800,
        age_days=12, ventilation_quality=0.8, insulation_quality=0.9,
    ),
    HouseProfile(
        house_id='HSE-B1', farm_id='FARM-02',
        house_code='House B1', capacity=6000,
        age_days=28, ventilation_quality=1.2, insulation_quality=1.1,
    ),
    HouseProfile(
        house_id='HSE-B2', farm_id='FARM-02',
        house_code='House B2', capacity=5500,
        age_days=28, ventilation_quality=0.7, insulation_quality=0.85,
    ),
    HouseProfile(
        house_id='HSE-C1', farm_id='FARM-03',
        house_code='House C1', capacity=7000,
        age_days=45, ventilation_quality=1.0, insulation_quality=1.0,
    ),
]

# Device IDs per house — match your existing devices table or seed new ones
HOUSE_DEVICES: Dict[str, List[str]] = {
    'HSE-A1': ['DEV-001', 'DEV-002'],
    'HSE-A2': ['DEV-003', 'DEV-004'],
    'HSE-B1': ['DEV-005', 'DEV-006'],
    'HSE-B2': ['DEV-007', 'DEV-008'],
    'HSE-C1': ['DEV-009', 'DEV-010'],
}

# Simulation timing
READINGS_PER_MINUTE = 1        # one reading per house per minute
SIMULATION_SPEED = 1.0         # 1.0 = real time, 2.0 = twice as fast
BACKFILL_DAYS = 21             # generate this many days of historical data on first run
BACKFILL_INTERVAL_SECONDS = 60 # interval between historical readings

# Realistic baseline ranges (before daily variation applied)
BASELINES = {
    'temperature': {'min': 26.0, 'max': 30.0},   # °C
    'humidity':    {'min': 55.0, 'max': 70.0},   # %RH
    'ammonia':     {'min': 5.0,  'max': 12.0},   # ppm
}

# Noise level (standard deviation of random noise added to each reading)
NOISE = {
    'temperature': 0.3,
    'humidity':    0.8,
    'ammonia':     0.5,
}
