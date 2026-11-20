import os
import joblib
import pandas as pd
from typing import Optional
from app.ai.dependencies import np, NUMPY_AVAILABLE
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

try:
    from app.ai.dependencies import pd, PANDAS_AVAILABLE, Prophet, PROPHET_AVAILABLE
except ImportError:
    PROPHET_AVAILABLE = False
    logger.warning('Prophet not installed — Tier 2 forecasting disabled')

from .config import METRICS, MODEL_DIR, MIN_DAYS_FOR_PROPHET
from .preprocessor import resample_and_clean


def _model_path(house_id: str, metric: str) -> str:
    os.makedirs(MODEL_DIR, exist_ok=True)
    safe_id = house_id.replace('/', '_').replace('-', '_')
    return os.path.join(MODEL_DIR, f'prophet_{safe_id}_{metric}.joblib')


def prophet_model_exists(house_id: str, metric: str) -> bool:
    """True if a trained Prophet model file exists on disk."""
    return os.path.exists(_model_path(house_id, metric))


def train_prophet(
    df: pd.DataFrame,
    house_id: str,
    metric: str,
) -> Optional[object]:
    """
    Train a Prophet model for a single metric in a single house.
    Saves model to disk. Returns the trained model or None on failure.
    """
    if not PROPHET_AVAILABLE:
        return None

    coverage_days = (pd.to_datetime(df['timestamp'].max(), utc=True) - pd.to_datetime(df['timestamp'].min(), utc=True)).total_seconds() / 86400
    if coverage_days < MIN_DAYS_FOR_PROPHET:
        logger.info(f'Skipping Prophet for {house_id}/{metric}: only {coverage_days:.1f} days of data')
        return None

    prophet_df = resample_and_clean(df, metric)
    if len(prophet_df) < 100:
        return None

    try:
        model = Prophet(
            daily_seasonality=True,
            weekly_seasonality=True,
            yearly_seasonality=False,   # not enough data
            changepoint_prior_scale=0.05,  # conservative — don't overfit to noise
            seasonality_prior_scale=10,
            interval_width=0.80,        # 80% confidence interval
            uncertainty_samples=100,    # faster than default 1000
        )

        # Add custom seasonality for poultry farm patterns
        # (feeding times create 4x-daily patterns)
        model.add_seasonality(
            name='feeding_cycle',
            period=0.25,     # 6 hours
            fourier_order=3,
        )

        model.fit(prophet_df)
        joblib.dump(model, _model_path(house_id, metric))
        logger.info(f'Trained Prophet for {house_id}/{metric} on {len(prophet_df)} points')
        return model

    except Exception as e:
        logger.error(f'Prophet training failed for {house_id}/{metric}: {e}')
        return None


def load_prophet(house_id: str, metric: str) -> Optional[object]:
    path = _model_path(house_id, metric)
    if not os.path.exists(path):
        return None
    try:
        return joblib.load(path)
    except Exception:
        return None


def forecast_prophet(
    house_id: str,
    metric: str,
    horizon_minutes: Optional[int] = None,
) -> dict:
    """
    Tier 2: Prophet-based forecast with confidence intervals.

    Returns:
    {
      'metric': str,
      'tier': 2,
      'available': bool,
      'forecast': [
        {
          'timestamp': ISO8601,
          'value': float,          # yhat (predicted)
          'lower': float,          # yhat_lower (80% CI)
          'upper': float,          # yhat_upper (80% CI)
          'minutes_ahead': int,
        }
      ],
      'will_breach_warn': bool,
      'will_breach_danger': bool,
      'minutes_to_warn': float | None,
      'minutes_to_danger': float | None,
    }
    """
    model = load_prophet(house_id, metric)
    if model is None:
        return {'metric': metric, 'tier': 2, 'available': False,
                'reason': 'Model not trained yet'}

    cfg = METRICS[metric]
    horizon = horizon_minutes or cfg.forecast_horizon

    try:
        future = model.make_future_dataframe(periods=horizon, freq='1min', include_history=False)
        forecast_df = model.predict(future)

        now = datetime.utcnow()
        rows = []
        for i, (_, row) in enumerate(forecast_df.iterrows()):
            minutes_ahead = i + 1
            rows.append({
                'timestamp':    row['ds'].isoformat(),
                'value':        round(float(row['yhat']), 2),
                'lower':        round(float(row['yhat_lower']), 2),
                'upper':        round(float(row['yhat_upper']), 2),
                'minutes_ahead': minutes_ahead,
            })

        # Breach detection using the predicted values
        will_breach_warn   = any(r['value'] >= cfg.warn_threshold for r in rows)
        will_breach_danger = any(r['value'] >= cfg.danger_threshold for r in rows)

        minutes_to_warn = next(
            (r['minutes_ahead'] for r in rows if r['value'] >= cfg.warn_threshold), None
        )
        minutes_to_danger = next(
            (r['minutes_ahead'] for r in rows if r['value'] >= cfg.danger_threshold), None
        )

        return {
            'metric':             metric,
            'tier':               2,
            'available':          True,
            'forecast':           rows,
            'will_breach_warn':   will_breach_warn,
            'will_breach_danger': will_breach_danger,
            'minutes_to_warn':    minutes_to_warn,
            'minutes_to_danger':  minutes_to_danger,
            'horizon_minutes':    horizon,
        }

    except Exception as e:
        logger.error(f'Prophet forecast failed for {house_id}/{metric}: {e}')
        return {'metric': metric, 'tier': 2, 'available': False, 'reason': str(e)}
