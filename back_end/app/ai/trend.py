from app.ai.dependencies import pd, PANDAS_AVAILABLE
from app.ai.dependencies import np, NUMPY_AVAILABLE
from datetime import datetime, timedelta
from typing import Optional
from .config import METRICS, TREND_WINDOW_MINUTES, TREND_MIN_READINGS, TREND_CONFIDENCE_THRESHOLD
from .preprocessor import compute_rate_of_change, compute_r_squared


def project_trend(
    series: pd.Series,
    metric: str,
    horizon_minutes: Optional[int] = None,
) -> dict:
    """
    Tier 1: Rule-based trend projection.
    No training required — works immediately with any amount of data.

    Returns:
    {
      'metric': str,
      'tier': 1,
      'available': bool,
      'current_value': float,
      'rate_per_minute': float,      # positive = rising, negative = falling
      'r_squared': float,            # confidence in the trend linearity
      'forecast': [                  # projected values at future timestamps
        { 'timestamp': ISO8601, 'value': float, 'minutes_ahead': int }
      ],
      'will_breach_warn': bool,
      'will_breach_danger': bool,
      'minutes_to_warn': float | None,
      'minutes_to_danger': float | None,
      'confidence': 'high' | 'medium' | 'low',
    }
    """
    cfg = METRICS.get(metric)
    if cfg is None or series.empty:
        return {'metric': metric, 'tier': 1, 'available': False}

    horizon = horizon_minutes or cfg.forecast_horizon

    # Need minimum readings
    recent_cutoff = series.index[-1] - pd.Timedelta(minutes=TREND_WINDOW_MINUTES)
    recent = series[series.index >= recent_cutoff]

    if len(recent) < TREND_MIN_READINGS:
        return {
            'metric': metric, 'tier': 1, 'available': False,
            'reason': f'Only {len(recent)} readings in window, need {TREND_MIN_READINGS}'
        }

    current = float(series.iloc[-1])
    rate = compute_rate_of_change(series, TREND_WINDOW_MINUTES)
    r2 = compute_r_squared(series, TREND_WINDOW_MINUTES)

    # Confidence based on R²
    if r2 >= 0.85:
        confidence = 'high'
    elif r2 >= TREND_CONFIDENCE_THRESHOLD:
        confidence = 'medium'
    else:
        confidence = 'low'

    # Generate forecast points
    now = series.index[-1]
    forecast = []
    for m in range(1, horizon + 1):
        projected = current + rate * m
        forecast.append({
            'timestamp': (now + pd.Timedelta(minutes=m)).isoformat(),
            'value': round(projected, 2),
            'minutes_ahead': m,
        })

    # Breach detection
    will_breach_warn   = False
    will_breach_danger = False
    minutes_to_warn    = None
    minutes_to_danger  = None

    if rate > 0:  # rising
        if current < cfg.warn_threshold:
            mins = (cfg.warn_threshold - current) / rate
            if mins <= horizon:
                will_breach_warn = True
                minutes_to_warn = round(mins, 1)
        if current < cfg.danger_threshold:
            mins = (cfg.danger_threshold - current) / rate
            if mins <= horizon:
                will_breach_danger = True
                minutes_to_danger = round(mins, 1)
    elif rate < 0:  # falling — check lower bounds
        pass  # extend for humidity/temp low threshold cases if needed

    return {
        'metric':              metric,
        'tier':                1,
        'available':           True,
        'current_value':       round(current, 2),
        'rate_per_minute':     round(rate, 4),
        'r_squared':           round(r2, 3),
        'forecast':            forecast,
        'will_breach_warn':    will_breach_warn,
        'will_breach_danger':  will_breach_danger,
        'minutes_to_warn':     minutes_to_warn,
        'minutes_to_danger':   minutes_to_danger,
        'confidence':          confidence,
        'horizon_minutes':     horizon,
    }
