import math
import random
# Removed numpy as it is not used in the sample code but available if needed
from datetime import datetime
from .config import HouseProfile, BASELINES, NOISE


def _time_of_day_factor(dt: datetime) -> float:
    """
    Returns a factor 0.0–1.0 representing time of day.
    Peaks at 14:00 (2pm), troughs at 04:00 (4am).
    Uses a cosine curve shifted to match farm diurnal patterns.
    """
    hour = dt.hour + dt.minute / 60.0
    # Shift so peak is at 14:00
    return 0.5 + 0.5 * math.cos(math.pi * (hour - 14) / 12)


def _feeding_cycle_factor(dt: datetime) -> float:
    """
    Ammonia spikes ~30 min after feeding times: 06:00, 10:00, 14:00, 18:00.
    Returns 0.0 at baseline, up to 1.0 at peak spike.
    """
    feeding_times = [6.5, 10.5, 14.5, 18.5]   # hours (30 min after feeding)
    hour = dt.hour + dt.minute / 60.0
    spike = 0.0
    for ft in feeding_times:
        # Gaussian spike centered at feeding time, width ~45 min
        spike = max(spike, math.exp(-0.5 * ((hour - ft) / 0.75) ** 2))
    return spike


def _flock_age_factor(age_days: int) -> float:
    """
    Older flocks produce more ammonia and body heat.
    Linear scale: day 0 = 0.5, day 42 = 1.5 (slaughter age ~42 days)
    """
    return 0.5 + (age_days / 42.0)


def generate_reading(house: HouseProfile, dt: datetime) -> dict:
    """
    Generate one realistic telemetry reading for a house at a given timestamp.
    All values are physically plausible and correlated with each other.
    """
    tod    = _time_of_day_factor(dt)
    feed   = _feeding_cycle_factor(dt)
    age    = _flock_age_factor(house.age_days)
    vent   = house.ventilation_quality
    insul  = house.insulation_quality

    # ── Temperature ──────────────────────────────────────────────────────────
    # Base range + daily variation + flock heat + insulation effect
    temp_base   = random.uniform(BASELINES['temperature']['min'],
                                 BASELINES['temperature']['max'])
    temp_daily  = 3.5 * tod              # up to 3.5°C daily swing
    temp_flock  = 1.2 * age             # older/denser flocks are warmer
    temp_insul  = (1.0 - insul) * 1.5  # poor insulation = more variation
    temp_noise  = random.gauss(0, NOISE['temperature'])
    temperature = temp_base + temp_daily + temp_flock + temp_insul + temp_noise

    # ── Humidity ─────────────────────────────────────────────────────────────
    # Inversely related to temperature (warmer air holds more moisture but
    # relative humidity drops). Feeding raises humidity from bird activity.
    hum_base    = random.uniform(BASELINES['humidity']['min'],
                                 BASELINES['humidity']['max'])
    hum_temp    = -2.0 * tod            # slight RH drop when hot
    hum_feed    = 4.0 * feed            # activity spike at feeding
    hum_vent    = (1.0 - vent) * 3.0   # poor ventilation traps moisture
    hum_noise   = random.gauss(0, NOISE['humidity'])
    humidity    = hum_base + hum_temp + hum_feed + hum_vent + hum_noise

    # ── Ammonia ──────────────────────────────────────────────────────────────
    # Strongly correlated with flock age, feeding cycles, and ventilation
    nh3_base    = random.uniform(BASELINES['ammonia']['min'],
                                 BASELINES['ammonia']['max'])
    nh3_age     = 6.0 * (age - 0.5)    # 0 at day 0, +6 at day 42
    nh3_feed    = 8.0 * feed * age      # post-feeding spike scales with age
    nh3_vent    = (1.0 - vent) * 5.0   # poor ventilation traps ammonia
    nh3_noise   = random.gauss(0, NOISE['ammonia'])
    ammonia     = nh3_base + nh3_age + nh3_feed + nh3_vent + nh3_noise

    # Clamp to physical bounds
    temperature = max(15.0, min(45.0, temperature))
    humidity    = max(20.0, min(99.0, humidity))
    ammonia     = max(0.0,  min(150.0, ammonia))

    return {
        'timestamp':   dt.isoformat(),
        'house_id':    house.house_id,
        'farm_id':     house.farm_id,
        'temperature': round(temperature, 2),
        'humidity':    round(humidity, 2),
        'ammonia':     round(ammonia, 2),
    }
