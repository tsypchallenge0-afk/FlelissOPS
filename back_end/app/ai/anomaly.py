import os
import joblib
from app.ai.dependencies import pd, PANDAS_AVAILABLE, IsolationForest, SKLEARN_AVAILABLE
from typing import List
import logging

logger = logging.getLogger(__name__)

from app.ai.dependencies import pd, PANDAS_AVAILABLE, IsolationForest, SKLEARN_AVAILABLE, StandardScaler, np, NUMPY_AVAILABLE

from .config import METRICS, MODEL_DIR, MIN_DAYS_FOR_ISOLATION
from .preprocessor import resample_and_clean, add_time_features


def _model_path(house_id: str) -> str:
    os.makedirs(MODEL_DIR, exist_ok=True)
    safe_id = house_id.replace('/', '_').replace('-', '_')
    return os.path.join(MODEL_DIR, f'iforest_{safe_id}.joblib')


def _scaler_path(house_id: str) -> str:
    os.makedirs(MODEL_DIR, exist_ok=True)
    safe_id = house_id.replace('/', '_').replace('-', '_')
    return os.path.join(MODEL_DIR, f'scaler_{safe_id}.joblib')


def anomaly_model_exists(house_id: str) -> bool:
    """True if the IsolationForest model + scaler exist on disk."""
    return os.path.exists(_model_path(house_id)) and os.path.exists(_scaler_path(house_id))


def _build_features(df: pd.DataFrame) -> np.ndarray:
    """
    Build feature matrix for anomaly detection.
    Features: temperature, humidity, ammonia, hour_sin, hour_cos, dow_sin, dow_cos
    """
    df = add_time_features(df)
    feature_cols = [
        'temperature', 'humidity', 'ammonia',
        'hour_sin', 'hour_cos', 'dow_sin', 'dow_cos',
    ]
    # Drop rows where any metric is missing
    df = df.dropna(subset=['temperature', 'humidity', 'ammonia'])
    return df[feature_cols].values, df


def train_anomaly_detector(df: pd.DataFrame, house_id: str) -> bool:
    """
    Train an Isolation Forest on historical telemetry.
    Returns True on success.
    """
    coverage_days = (pd.to_datetime(df['timestamp'].max(), utc=True) - pd.to_datetime(df['timestamp'].min(), utc=True)).total_seconds() / 86400
    if coverage_days < MIN_DAYS_FOR_ISOLATION:
        logger.info(f'Skipping anomaly detector for {house_id}: only {coverage_days:.1f} days')
        return False

    try:
        X, _ = _build_features(df)
        if len(X) < 50:
            return False

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        model = IsolationForest(
            n_estimators=100,
            contamination=0.05,     # expect ~5% anomalies in training data
            random_state=42,
            n_jobs=-1,              # use all CPU cores
        )
        model.fit(X_scaled)

        joblib.dump(model, _model_path(house_id))
        joblib.dump(scaler, _scaler_path(house_id))
        logger.info(f'Trained anomaly detector for {house_id} on {len(X)} samples')
        return True

    except Exception as e:
        logger.error(f'Anomaly training failed for {house_id}: {e}')
        return False


def detect_anomalies(
    df: pd.DataFrame,
    house_id: str,
    recent_only: bool = True,
) -> List[dict]:
    """
    Run anomaly detection on telemetry data.
    If recent_only=True, only scores the last 60 readings.
    Returns list of anomaly dicts.
    """
    model_p  = _model_path(house_id)
    scaler_p = _scaler_path(house_id)

    if not os.path.exists(model_p) or not os.path.exists(scaler_p):
        return []

    try:
        model  = joblib.load(model_p)
        scaler = joblib.load(scaler_p)

        score_df = df.tail(60) if recent_only else df
        X, enriched = _build_features(score_df)

        if len(X) == 0:
            return []

        X_scaled = scaler.transform(X)

        # -1 = anomaly, 1 = normal
        predictions = model.predict(X_scaled)
        scores      = model.score_samples(X_scaled)  # lower = more anomalous

        anomalies = []
        for i, (pred, score) in enumerate(zip(predictions, scores)):
            if pred == -1:
                row = enriched.iloc[i]
                anomalies.append({
                    'timestamp':   row['timestamp'].isoformat(),
                    'house_id':    house_id,
                    'temperature': round(float(row['temperature']), 2),
                    'humidity':    round(float(row['humidity']), 2),
                    'ammonia':     round(float(row['ammonia']), 2),
                    'anomaly_score': round(float(score), 4),  # more negative = worse
                    'severity':    'critical' if score < -0.2 else 'warning',
                    'type':        'anomaly',
                })

        return sorted(anomalies, key=lambda x: x['anomaly_score'])

    except Exception as e:
        logger.error(f'Anomaly detection failed for {house_id}: {e}')
        return []
