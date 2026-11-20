from fastapi import APIRouter, Depends, HTTPException
from .data_loader import load_telemetry, get_data_coverage
from app.auth.dependencies import require_auth

from fastapi import Request
from app.utils.tenant_query import scoped, tag, scoped_pipeline
from app.utils.quota import check_quota

try:
    from app.ai.predictor import get_predictions
    from app.ai.forecaster import train_prophet
    from app.ai.anomaly import train_anomaly_detector, detect_anomalies
    AI_AVAILABLE = True
except ImportError:
    AI_AVAILABLE = False
    def get_predictions(*args): return {"anomalies": [], "predictions": {}}
    def train_prophet(*args): return None
    def train_anomaly_detector(*args): return False
    def detect_anomalies(*args, **kwargs): return []

router = APIRouter(prefix='/ai', tags=['AI'])


@router.get('/predictions/{house_id}')
async def predictions(request: Request, 
    house_id: str,
    user = Depends(require_auth()),
):
    """
    Returns the best available prediction for all three metrics
    plus any detected anomalies.
    Cached for 60 seconds — recomputed by background scheduler.
    """
    try:
        return get_predictions(house_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/predictions/{house_id}/{metric}')
async def prediction_for_metric(request: Request, 
    house_id: str,
    metric: str,
    user = Depends(require_auth()),
):
    """Single metric prediction — faster than full house prediction."""
    from app.ai.data_loader import load_telemetry
    from app.ai.preprocessor import resample_and_clean
    from app.ai.trend import project_trend
    from app.ai.forecaster import forecast_prophet
    from app.ai.config import METRICS, MIN_DAYS_FOR_PROPHET

    if metric not in METRICS:
        raise HTTPException(status_code=400, detail=f'Unknown metric: {metric}')

    coverage = get_data_coverage(house_id)
    days = coverage.get('days', 0)
    df = load_telemetry(house_id, days_back=30)

    clean = resample_and_clean(df, metric)
    series = clean.set_index('ds')['y']
    tier1 = project_trend(series, metric)

    if days >= MIN_DAYS_FOR_PROPHET:
        tier2 = forecast_prophet(house_id, metric)
        if tier2.get('available'):
            return tier2

    return tier1


@router.get('/anomalies/{house_id}')
async def anomalies(request: Request, 
    house_id: str,
    user = Depends(require_auth()),
):
    """Returns anomalies detected in the last 60 readings."""
    df = load_telemetry(house_id, days_back=1)
    return detect_anomalies(df, house_id, recent_only=True)


@router.get('/coverage/{house_id}')
async def coverage(request: Request, 
    house_id: str,
    user = Depends(require_auth()),
):
    """Returns data coverage stats — used by frontend to show which tiers are active."""
    return get_data_coverage(house_id)


@router.post('/train/{house_id}')
async def trigger_training(request: Request, 
    house_id: str,
    user = Depends(require_auth()),
):
    """
    Manually trigger retraining for a house.
    Admin only. Runs synchronously — may take 30-60 seconds.
    """
    # Check if user has admin role (adjust based on your auth system)
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin access required')

    df = load_telemetry(house_id, days_back=30)
    if df.empty:
        raise HTTPException(status_code=422, detail='No data available for training')

    results = {}
    for metric in ['temperature', 'humidity', 'ammonia']:
        model = train_prophet(df, house_id, metric)
        results[metric] = 'trained' if model else 'skipped'

    anomaly_ok = train_anomaly_detector(df, house_id)
    results['anomaly_detector'] = 'trained' if anomaly_ok else 'skipped'

    from app.ai.scheduler import register_house
    register_house(house_id)

    return {'house_id': house_id, 'results': results}


@router.get('/actions')
async def get_all_ai_actions(request: Request, 
    limit: int = 200,
    user = Depends(require_auth()),
):
    """
    Returns recent AI-initiated control commands for the entire tenant.
    Reads from control_commands table where operator_id = 'AI_SYSTEM'.
    """
    from app.database import db
    
    rows = list(db.control_commands.find(
        scoped(request, {"operator_id": "AI_SYSTEM"})
    ).sort("created_at", -1).limit(limit))
    
    for r in rows:
        r["id"] = r.pop("_id", None)
        if "timestamp" not in r and "created_at" in r:
            r["timestamp"] = r["created_at"]
            
    return rows


@router.get('/actions/{house_id}')
async def get_ai_actions(request: Request, 
    house_id: str,
    limit: int = 50,
    user = Depends(require_auth()),
):
    """
    Returns recent AI-initiated control commands for a house.
    Reads from control_commands table where operator_id = 'AI_SYSTEM'.
    """
    from app.database import db
    
    rows = list(db.control_commands.find(
        {"house_id": house_id, "operator_id": "AI_SYSTEM"}
    ).sort("created_at", -1).limit(limit))
    
    for r in rows:
        r["id"] = r.pop("_id", None)
        if "timestamp" not in r and "created_at" in r:
            r["timestamp"] = r["created_at"]
            
    return rows
