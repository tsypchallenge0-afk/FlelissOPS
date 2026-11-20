from app.ai.dependencies import pd, PANDAS_AVAILABLE
from datetime import datetime, timezone
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)

from .config import METRICS, MIN_DAYS_FOR_PROPHET, MIN_DAYS_FOR_ISOLATION
from .data_loader import load_telemetry, get_data_coverage
from .trend import project_trend
from .forecaster import forecast_prophet, PROPHET_AVAILABLE, prophet_model_exists
from .anomaly import detect_anomalies, anomaly_model_exists
from .preprocessor import resample_and_clean


def get_predictions(house_id: str) -> dict:
    """
    Main entry point. Returns the best available prediction for each metric,
    plus anomaly detections.

    Tier selection:
    - Always run Tier 1 (trend projection) — zero cost
    - Run Tier 2 (Prophet) if model exists and data covers 14+ days
    - Run Tier 3 (Isolation Forest) if model exists and data covers 7+ days
    - Return highest tier available per metric
    """
    coverage = get_data_coverage(house_id)
    days = coverage.get('days', 0)

    # Load data once — used by all tiers
    logger.debug(f'Loading telemetry for house_id={house_id!r}')
    df = load_telemetry(house_id, days_back=min(30, max(int(days), 3)))
    logger.debug(f'Loaded {len(df)} rows')

    predictions = {}

    for metric in METRICS:
        # Build time-indexed series for this metric
        if df.empty or metric not in df.columns:
            predictions[metric] = _normalize_metric_prediction({
                'metric': metric,
                'tier': 1,
                'available': False,
                'reason': 'No telemetry data',
            }, metric)
            continue

        clean = resample_and_clean(df, metric)
        if clean.empty:
            predictions[metric] = _normalize_metric_prediction({
                'metric': metric,
                'tier': 1,
                'available': False,
                'reason': 'Insufficient clean data',
            }, metric)
            continue

        series = clean.set_index('ds')['y']

        # Tier 1 — always
        tier1 = project_trend(series, metric)

        # Tier 2 — if model available
        tier2 = forecast_prophet(house_id, metric) if days >= MIN_DAYS_FOR_PROPHET else \
                {'metric': metric, 'tier': 2, 'available': False, 'reason': f'Need {MIN_DAYS_FOR_PROPHET} days'}

        # Use best available tier
        if tier2.get('available'):
            result = tier2
            # Include trend context and also normalize required top-level fields
            result['tier1_context'] = {
                'current_value':    tier1.get('current_value'),
                'rate_per_minute':  tier1.get('rate_per_minute'),
                'r_squared':        tier1.get('r_squared'),
                'confidence':       tier1.get('confidence'),
            }

            # Prophet predictions do not currently expose these at top-level, but the
            # frontend contract expects them to always exist.
            result['current_value'] = tier1.get('current_value')
            result['rate_per_minute'] = tier1.get('rate_per_minute')
            result['r_squared'] = tier1.get('r_squared')
            result['confidence'] = tier1.get('confidence')
        else:
            result = tier1

        predictions[metric] = _normalize_metric_prediction(result, metric)

    # Tier 3 — anomaly detection (house-level, not per-metric)
    anomaly_active = days >= MIN_DAYS_FOR_ISOLATION and anomaly_model_exists(house_id)
    anomalies = detect_anomalies(df, house_id) if anomaly_active else []

    # Compute overall risk from predictions
    risk_level = _compute_risk_level(predictions)

    prophet_active = (
        PROPHET_AVAILABLE
        and days >= MIN_DAYS_FOR_PROPHET
        and any(prophet_model_exists(house_id, m) for m in METRICS)
    )

    return {
        'house_id':   house_id,
        'generated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'data_coverage': coverage,
        'risk_level': risk_level,
        'predictions': predictions,
        'anomalies':  anomalies,
        'active_tiers': {
            'trend':   True,
            'prophet': prophet_active,
            'anomaly': anomaly_active,
        }
    }


def _compute_risk_level(predictions: dict) -> str:
    """
    Aggregate risk across all metrics.
    """
    danger_count = sum(
        1 for p in predictions.values()
        if p.get('will_breach_danger')
    )
    warn_count = sum(
        1 for p in predictions.values()
        if p.get('will_breach_warn')
    )

    if danger_count >= 2: return 'CRITICAL'
    if danger_count >= 1: return 'HIGH'
    if warn_count >= 2:   return 'MEDIUM'
    if warn_count >= 1:   return 'LOW'
    return 'NORMAL'


def _normalize_metric_prediction(pred: dict, metric: str) -> dict:
    """
    Normalize prediction objects so every metric matches the strict frontend contract.
    """
    cfg = METRICS.get(metric)
    horizon = cfg.forecast_horizon if cfg else None

    out = dict(pred or {})
    out.setdefault('metric', metric)
    out.setdefault('tier', 1)
    out.setdefault('available', False)

    # Required fields for contract stability
    out.setdefault('current_value', None)
    out.setdefault('rate_per_minute', None)
    out.setdefault('r_squared', None)
    out.setdefault('confidence', None)
    out.setdefault('will_breach_warn', False)
    out.setdefault('will_breach_danger', False)
    out.setdefault('minutes_to_warn', None)
    out.setdefault('minutes_to_danger', None)
    out.setdefault('horizon_minutes', horizon)
    out.setdefault('forecast', [])

    if out.get('available') is False and not out.get('reason'):
        out['reason'] = 'Prediction unavailable'

    # If tier1_context exists, fill any missing top-level fields from it.
    tier1_ctx = out.get('tier1_context') or {}
    if out.get('current_value') is None:
        out['current_value'] = tier1_ctx.get('current_value')
    if out.get('rate_per_minute') is None:
        out['rate_per_minute'] = tier1_ctx.get('rate_per_minute')
    if out.get('r_squared') is None:
        out['r_squared'] = tier1_ctx.get('r_squared')
    if out.get('confidence') is None:
        out['confidence'] = tier1_ctx.get('confidence')

    # Ensure forecast is always an array for the contract.
    if out.get('forecast') is None:
        out['forecast'] = []

    return out
