import random
import logging
from datetime import datetime, timedelta
from typing import Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ActiveAnomaly:
    house_id: str
    fault_type: str
    started_at: datetime
    duration_minutes: int
    intensity: float = 1.0     # multiplier on the fault effect
    acknowledged: bool = False


# Tracks currently active faults per house
_active_faults: dict[str, ActiveAnomaly] = {}


FAULT_TYPES = {
    'heater_runaway': {
        'description': 'Heater stuck on — temperature rising',
        'temp_delta':  +0.8,    # °C per minute
        'hum_delta':   -0.3,
        'nh3_delta':   +0.1,
        'duration_range': (20, 60),
        'probability': 0.002,   # per reading per house
    },
    'ventilation_failure': {
        'description': 'Fan failure — ammonia and humidity rising',
        'temp_delta':  +0.3,
        'hum_delta':   +0.6,
        'nh3_delta':   +0.9,
        'duration_range': (30, 120),
        'probability': 0.001,
    },
    'sensor_drift': {
        'description': 'Sensor reading drifting high',
        'temp_delta':  +0.2,
        'hum_delta':   +0.2,
        'nh3_delta':   +0.3,
        'duration_range': (60, 240),
        'probability': 0.0005,
    },
    'cold_snap': {
        'description': 'External cold snap — temperature dropping',
        'temp_delta':  -0.5,
        'hum_delta':   +0.4,
        'nh3_delta':   +0.2,
        'duration_range': (45, 180),
        'probability': 0.001,
    },
}


def maybe_inject_fault(house_id: str, dt: datetime) -> Optional[str]:
    """
    Randomly starts a new fault for a house.
    Returns fault_type if injected, None otherwise.
    Only one active fault per house at a time.
    """
    if house_id in _active_faults:
        return None  # already has an active fault

    for fault_type, cfg in FAULT_TYPES.items():
        if random.random() < cfg['probability']:
            duration = random.randint(*cfg['duration_range'])
            _active_faults[house_id] = ActiveAnomaly(
                house_id=house_id,
                fault_type=fault_type,
                started_at=dt,
                duration_minutes=duration,
                intensity=random.uniform(0.7, 1.3),
            )
            logger.info(
                f'[Simulator] Fault injected: {fault_type} in {house_id} '
                f'for {duration} min'
            )
            return fault_type

    return None


def apply_fault(reading: dict, house_id: str, dt: datetime) -> dict:
    """
    Applies the effect of any active fault to a reading.
    Removes expired faults.
    """
    fault = _active_faults.get(house_id)
    if not fault:
        return reading

    # Check if fault has expired
    elapsed = (dt - fault.started_at).total_seconds() / 60
    if elapsed > fault.duration_minutes:
        logger.info(f'[Simulator] Fault cleared: {fault.fault_type} in {house_id}')
        del _active_faults[house_id]
        return reading

    cfg = FAULT_TYPES[fault.fault_type]
    reading = reading.copy()

    # Apply cumulative delta scaled by elapsed time and intensity
    reading['temperature'] = round(
        reading['temperature'] + cfg['temp_delta'] * elapsed * fault.intensity, 2
    )
    reading['humidity'] = round(
        min(99.0, reading['humidity'] + cfg['hum_delta'] * elapsed * fault.intensity), 2
    )
    reading['ammonia'] = round(
        max(0.0, reading['ammonia'] + cfg['nh3_delta'] * elapsed * fault.intensity), 2
    )

    return reading


def get_active_faults() -> dict:
    return {h: f.fault_type for h, f in _active_faults.items()}


def clear_fault(house_id: str):
    """Call this when an operator ACKs an alert — simulates them fixing the issue."""
    if house_id in _active_faults:
        del _active_faults[house_id]
        logger.info(f'[Simulator] Fault manually cleared for {house_id}')
