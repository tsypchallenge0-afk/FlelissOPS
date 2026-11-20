from app.ai.dependencies import pd, PANDAS_AVAILABLE, np, NUMPY_AVAILABLE
import numpy as np
from .config import METRICS


def resample_and_clean(df: pd.DataFrame, metric: str, freq: str = '1min') -> pd.DataFrame:
    """
    Resample raw telemetry to a regular frequency, interpolate gaps,
    and remove outliers.
    """
    if df.empty or metric not in df.columns:
        return pd.DataFrame(columns=['ds', 'y'])

    series = df.set_index('timestamp')[metric].copy()
    # Ensure timestamps are UTC before any resampling (avoids empty resampled series).
    if series.index.tz is None:
        series.index = series.index.tz_localize('UTC')

    # Remove physically impossible values
    cfg = METRICS[metric]
    bounds = {
        'temperature': (-10, 60),
        'humidity':    (0, 100),
        'ammonia':     (0, 200),
    }
    lo, hi = bounds.get(metric, (-1e9, 1e9))
    series = series[(series >= lo) & (series <= hi)]

    # Resample to regular intervals
    series = series.resample(freq).mean()

    # Interpolate gaps up to 10 minutes
    series = series.interpolate(method='time', limit=10)

    # Drop remaining NaN (long outages)
    series = series.dropna()

    # Prophet expects columns named 'ds' and 'y'
    return pd.DataFrame({'ds': series.index, 'y': series.values})


def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add cyclical time features for anomaly detection.
    hour_sin/cos, dow_sin/cos capture daily and weekly patterns.
    """
    df = df.copy()
    ts = pd.to_datetime(df['timestamp'])
    df['hour']    = ts.dt.hour
    df['minute']  = ts.dt.minute
    df['dow']     = ts.dt.dayofweek
    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
    df['dow_sin']  = np.sin(2 * np.pi * df['dow'] / 7)
    df['dow_cos']  = np.cos(2 * np.pi * df['dow'] / 7)
    return df


def compute_rate_of_change(series: pd.Series, window_minutes: int = 10) -> float:
    """
    Compute the linear rate of change (units per minute) over the last
    window_minutes of readings.
    Returns the slope of a linear regression fit.
    """
    if len(series) < 2:
        return 0.0

    cutoff = series.index[-1] - pd.Timedelta(minutes=window_minutes)
    window = series[series.index >= cutoff]

    if len(window) < 2:
        return 0.0

    # Convert timestamps to minutes since start for regression
    x = np.array([(t - window.index[0]).total_seconds() / 60 for t in window.index])
    y = window.values.astype(float)

    # Linear regression via least squares
    A = np.vstack([x, np.ones(len(x))]).T
    try:
        slope, _ = np.linalg.lstsq(A, y, rcond=None)[0]
        return float(slope)
    except Exception:
        return 0.0


def compute_r_squared(series: pd.Series, window_minutes: int = 10) -> float:
    """
    Compute R² of the linear fit over the window.
    Higher R² = more confident the trend is consistent (not noisy).
    """
    if len(series) < 3:
        return 0.0

    cutoff = series.index[-1] - pd.Timedelta(minutes=window_minutes)
    window = series[series.index >= cutoff]

    if len(window) < 3:
        return 0.0

    x = np.array([(t - window.index[0]).total_seconds() / 60 for t in window.index])
    y = window.values.astype(float)

    A = np.vstack([x, np.ones(len(x))]).T
    try:
        coeffs = np.linalg.lstsq(A, y, rcond=None)[0]
        y_pred = A @ coeffs
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - y.mean()) ** 2)
        return float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0
    except Exception:
        return 0.0
