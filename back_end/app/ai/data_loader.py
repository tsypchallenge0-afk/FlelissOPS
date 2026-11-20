try:
    from app.ai.dependencies import pd, PANDAS_AVAILABLE
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    class pd:
        class DataFrame:
            def __init__(self, *args, **kwargs):
                self.empty = True
            def sort_values(self, *args, **kwargs): return self
            def reset_index(self, *args, **kwargs): return self
            def dropna(self, *args, **kwargs): return self
        @staticmethod
        def to_datetime(arg, **kwargs): return arg
        @staticmethod
        def isna(arg): return False
from datetime import datetime, timedelta, timezone
from typing import Optional
import logging
from app.database import db

logger = logging.getLogger(__name__)

def load_telemetry(
    house_id: str,
    days_back: int = 30,
    metric: Optional[str] = None
) -> pd.DataFrame:
    """
    Load telemetry history for a house.
    Returns DataFrame with columns:
      timestamp (datetime), house_id (str),
      temperature (float), humidity (float), ammonia (float)
    """
    since = datetime.now(timezone.utc) - timedelta(days=days_back)
    # Telemetry historical rows may have `timestamp` stored either as:
    #  - a MongoDB datetime (BSON Date)
    #  - an ISO8601 string (from older inserts)
    # Try querying with datetime first; if empty, fall back to ISO string.
    since_iso = since.isoformat()

    # Get devices for this house first
    devices = list(db.devices.find({"house_id": house_id}))
    device_ids = [str(d["_id"]) for d in devices]

    if not device_ids:
        return pd.DataFrame()

    # Query telemetry for all devices in this house
    telemetry_rows = list(db.telemetry.find({
        "device_id": {"$in": device_ids},
        "timestamp": {"$gte": since}
    }).sort("timestamp", 1))

    if not telemetry_rows:
        # Fallback for older string timestamps.
        telemetry_rows = list(db.telemetry.find({
            "device_id": {"$in": device_ids},
            "timestamp": {"$gte": since_iso}
        }).sort("timestamp", 1))

    if not telemetry_rows:
        return pd.DataFrame()

    df = pd.DataFrame([{
        'timestamp':   r['timestamp'],
        'house_id':    house_id,
        'temperature': r.get('temperature'),
        'humidity':    r.get('humidity'),
        'ammonia':     r.get('ammonia'),
    } for r in telemetry_rows])

    # Ensure correct types
    if df.empty:
        return df
    
    # Ensure all timestamps are timezone-aware UTC before returning.
    df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True)
    df = df.sort_values('timestamp').reset_index(drop=True)

    # Drop rows where all metrics are null
    metric_cols = ['temperature', 'humidity', 'ammonia']
    df = df.dropna(subset=metric_cols, how='all')

    return df


def load_alert_history(house_id: str, days_back: int = 30) -> pd.DataFrame:
    """
    Load alert history for correlation analysis.
    Returns DataFrame with columns:
      timestamp, house_id, metric, value, severity, outcome
    where outcome is: 'acknowledged' | 'resolved' | 'escalated' | 'auto_resolved'
    """
    since = datetime.now(timezone.utc) - timedelta(days=days_back)

    # Get devices for this house first
    devices = list(db.devices.find({"house_id": house_id}))
    device_ids = [str(d["_id"]) for d in devices]

    if not device_ids:
        return pd.DataFrame()

    # Query alerts for all devices in this house
    alert_rows = list(db.alerts.find({
        "device_id": {"$in": device_ids},
        "timestamp": {"$gte": since}
    }).sort("timestamp", 1))

    if not alert_rows:
        return pd.DataFrame()

    df = pd.DataFrame([{
        'timestamp': r['timestamp'],
        'house_id':  house_id,
        'metric':    r.get('type', '').replace('_danger', '').replace('_warning', ''),
        'value':     r.get('value'),
        'severity':  'danger' if 'danger' in r.get('type', '') else 'warning',
        'outcome':   r.get('status', 'active'),
    } for r in alert_rows])

    if df.empty:
        return df
    df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True)
    return df.sort_values('timestamp').reset_index(drop=True)


def get_data_coverage(house_id: str) -> dict:
    """
    Returns how many days of data exist for a house.
    Used to decide which prediction tier to activate.
    """
    # Get devices for this house first
    devices = list(db.devices.find({"house_id": house_id}))
    device_ids = [str(d["_id"]) for d in devices]

    if not device_ids:
        return {'days': 0, 'count': 0, 'earliest': None, 'latest': None}

    # Get telemetry coverage for all devices in this house
    result = db.telemetry.aggregate([
        {"$match": {"device_id": {"$in": device_ids}}},
        {"$group": {
            "_id": None,
            "earliest": {"$min": "$timestamp"},
            "latest": {"$max": "$timestamp"},
            "count": {"$sum": 1}
        }}
    ])

    coverage = list(result)
    if not coverage:
        return {'days': 0, 'count': 0, 'earliest': None, 'latest': None}

    data = coverage[0]
    earliest = data.get('earliest')
    latest = data.get('latest')
    count = data.get('count', 0)

    if not earliest or not latest:
        return {'days': 0, 'count': 0, 'earliest': None, 'latest': None}

    if not PANDAS_AVAILABLE:
        # Minimal fallback for coverage check without pandas
        try:
            from datetime import timedelta
            diff = latest - earliest
            days = diff.total_seconds() / 86400
            return {
                'days': round(days, 1),
                'count': count,
                'earliest': earliest.isoformat().replace('+00:00', 'Z') if hasattr(earliest, 'isoformat') else str(earliest),
                'latest': latest.isoformat().replace('+00:00', 'Z') if hasattr(latest, 'isoformat') else str(latest),
            }
        except Exception:
            return {'days': 0, 'count': count, 'earliest': None, 'latest': None}

    # Normalize to UTC-aware timestamps for correct delta + consistent ISO formatting.
    earliest_ts = pd.to_datetime(earliest, utc=True, errors='coerce')
    latest_ts = pd.to_datetime(latest, utc=True, errors='coerce')
    if pd.isna(earliest_ts) or pd.isna(latest_ts):
        return {'days': 0, 'count': count, 'earliest': None, 'latest': None}

    if latest_ts < earliest_ts:
        earliest_ts, latest_ts = latest_ts, earliest_ts

    days = float((latest_ts - earliest_ts).total_seconds() / 86400)
    days = max(0.0, days)
    return {
        'days': round(days, 1),
        'count': count,
        'earliest': earliest_ts.isoformat().replace('+00:00', 'Z'),
        'latest': latest_ts.isoformat().replace('+00:00', 'Z'),
    }
