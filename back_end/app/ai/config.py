from dataclasses import dataclass, field
from typing import Dict
import os as _os

@dataclass
class MetricConfig:
    warn_threshold: float
    danger_threshold: float
    unit: str
    resample_freq: str = '1min'     # resample raw readings to this frequency
    forecast_horizon: int = 30       # minutes ahead to forecast
    anomaly_contamination: float = 0.05  # expected anomaly rate (5%)

METRICS: Dict[str, MetricConfig] = {
    'temperature': MetricConfig(
        warn_threshold=32.0,
        danger_threshold=35.0,
        unit='°C',
        forecast_horizon=45,
    ),
    'humidity': MetricConfig(
        warn_threshold=75.0,
        danger_threshold=85.0,
        unit='%RH',
        forecast_horizon=30,
    ),
    'ammonia': MetricConfig(
        warn_threshold=15.0,
        danger_threshold=25.0,
        unit='ppm',
        forecast_horizon=20,  # ammonia spikes faster
    ),
}

# Trend projection config
TREND_WINDOW_MINUTES = 10       # look back this far to compute rate of change
TREND_MIN_READINGS = 5          # need at least this many points to project
TREND_CONFIDENCE_THRESHOLD = 0.7  # R² must exceed this to trust the projection

# Retraining schedule
RETRAIN_INTERVAL_MINUTES = 60   # retrain models every hour
ANOMALY_RETRAIN_INTERVAL_MINUTES = 30

# Minimum data requirements per tier
MIN_DAYS_FOR_PROPHET = 14       # need 2 weeks for reliable seasonality
MIN_DAYS_FOR_ISOLATION = 7      # need 1 week for anomaly baseline

# Model persistence — absolute path relative to this file so it works regardless of CWD
MODEL_DIR = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'models')

# Broadcast config
PREDICTION_BROADCAST_INTERVAL_SECONDS = 60  # send predictions every minute
