import asyncio
import logging
from datetime import datetime
from typing import Set

logger = logging.getLogger(__name__)

from .config import (
    RETRAIN_INTERVAL_MINUTES,
    ANOMALY_RETRAIN_INTERVAL_MINUTES,
    PREDICTION_BROADCAST_INTERVAL_SECONDS,
)
from .data_loader import load_telemetry, get_data_coverage

try:
    from .forecaster import train_prophet
    from .anomaly import train_anomaly_detector
    from .predictor import get_predictions
    AI_AVAILABLE = True
except ImportError:
    logger.warning("AI dependencies (pandas, prophet, scikit-learn) missing. AI features will be disabled.")
    AI_AVAILABLE = False
    def train_prophet(*args, **kwargs): pass
    def train_anomaly_detector(*args, **kwargs): pass
    def get_predictions(*args, **kwargs): return {"anomalies": [], "predictions": {}}

# WebSocket broadcast - adapt to existing implementation
from app.websocket.manager import manager
from app.database import db as _db

# Track which houses are being monitored
_monitored_houses: Set[str] = set()


def register_house(house_id: str):
    """Call this when a house connects or when the app starts."""
    _monitored_houses.add(house_id)


async def retrain_loop():
    """Background task: retrain Prophet models every hour."""
    while True:
        await asyncio.sleep(RETRAIN_INTERVAL_MINUTES * 60)
        for house_id in list(_monitored_houses):
            try:
                logger.info(f'Retraining Prophet for {house_id}')
                df = load_telemetry(house_id, days_back=30)
                if df.empty:
                    continue
                for metric in ['temperature', 'humidity', 'ammonia']:
                    train_prophet(df, house_id, metric)
            except Exception as e:
                logger.error(f'Retrain failed for {house_id}: {e}')


async def anomaly_retrain_loop():
    """Background task: retrain Isolation Forest every 30 minutes."""
    while True:
        await asyncio.sleep(ANOMALY_RETRAIN_INTERVAL_MINUTES * 60)
        for house_id in list(_monitored_houses):
            try:
                df = load_telemetry(house_id, days_back=14)
                if not df.empty:
                    train_anomaly_detector(df, house_id)
            except Exception as e:
                logger.error(f'Anomaly retrain failed for {house_id}: {e}')


async def prediction_broadcast_loop():
    """
    Background task: compute and broadcast predictions every 60 seconds.
    Sends two WebSocket message types:
      type='prediction' — forecast data for chart overlay
      type='anomaly'    — detected anomalies for alert console
    """
    while True:
        await asyncio.sleep(PREDICTION_BROADCAST_INTERVAL_SECONDS)

        # Dynamically register any new houses added since startup
        try:
            live_house_ids = [str(h['_id']) for h in _db.houses.find({}, {'_id': 1})]
            for hid in live_house_ids:
                register_house(hid)
        except Exception as e:
            logger.warning(f'Failed to refresh monitored houses: {e}')

        for house_id in list(_monitored_houses):
            try:
                # Resolve tenant_id for the house
                house = _db.houses.find_one({"_id": house_id})
                if not house:
                    from bson import ObjectId
                    try:
                        house = _db.houses.find_one({"_id": ObjectId(house_id)})
                    except:
                        pass
                
                tenant_id = house.get("tenant_id") if house else "default"

                result = get_predictions(house_id)

                # Broadcast prediction message with tenant_id
                await manager.broadcast({
                    'type': 'prediction',
                    'tenant_id': tenant_id, # Inject tenant
                    **result,
                })

                # Broadcast anomaly messages with tenant_id
                for anomaly in result.get('anomalies', []):
                    await manager.broadcast({
                        'type':     'anomaly',
                        'tenant_id': tenant_id, # Inject tenant
                        'house_id': house_id,
                        **anomaly,
                    })

            except Exception as e:
                logger.error(f'Prediction broadcast failed for {house_id}: {e}')


async def initial_training(house_ids: list):
    """
    Run initial model training on startup for all known houses.
    Call this once from your app startup event.
    """
    for house_id in house_ids:
        coverage = get_data_coverage(house_id)
        days = coverage.get('days', 0)
        logger.info(f'Initial training for {house_id}: {days:.1f} days of data')

        df = load_telemetry(house_id, days_back=30)
        if df.empty:
            continue

        if days >= 7:
            train_anomaly_detector(df, house_id)

        if days >= 14:
            for metric in ['temperature', 'humidity', 'ammonia']:
                train_prophet(df, house_id, metric)

        register_house(house_id)
