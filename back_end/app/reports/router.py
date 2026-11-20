from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from bson.objectid import ObjectId

from .generator import generate_farm_report
from .scheduler import register_report_job, unregister_report_job
from app.auth.dependencies import require_auth

from fastapi import Request
from app.utils.tenant_query import scoped, tag, scoped_pipeline
from app.utils.quota import check_quota
from app.database import db

router = APIRouter(prefix='/reports', tags=['Reports'])

class ReportScheduleCreate(BaseModel):
    farm_id:       Optional[str] = None
    farm_name:     str = 'All Farms'
    frequency:     str = 'weekly'       # 'daily' | 'weekly' | 'monthly'
    recipients:    list[str]
    day_of_week:   Optional[str] = 'mon'    # for weekly
    day_of_month:  Optional[int] = 1        # for monthly
    hour:          int = 7
    enabled:       bool = True

@router.get('/schedules')
def list_schedules(request: Request, user=Depends(require_auth())):
    schedules = list(db.report_schedules.find(scoped(request, {})))
    for s in schedules:
        s['_id'] = str(s['_id'])
    return schedules

@router.post('/schedules')
def create_schedule(request: Request, 
    payload: ReportScheduleCreate,
    user = Depends(require_auth(roles=['admin'])),
):
    doc = payload.dict()
    doc['created_by'] = user['id']
    doc['created_at'] = datetime.utcnow()
    doc['last_sent']  = None
    doc['last_status']= None
    result = db.report_schedules.insert_one(tag(request, doc))
    doc['_id'] = str(result.inserted_id)
    register_report_job(doc)
    return doc

@router.patch('/schedules/{schedule_id}')
def update_schedule(request: Request, 
    schedule_id: str,
    payload:     dict,
    user = Depends(require_auth(roles=['admin'])),
):
    try:
        obj_id = ObjectId(schedule_id)
    except:
        obj_id = schedule_id
        
    db.report_schedules.update_one(
        {'_id': obj_id},
        {'$set': payload}
    )
    updated = db.report_schedules.find_one(scoped(request, {'_id': obj_id}))
    if updated:
        updated['_id'] = str(updated['_id'])
        register_report_job(updated)
    return updated

@router.delete('/schedules/{schedule_id}')
def delete_schedule(request: Request, 
    schedule_id: str,
    user = Depends(require_auth(roles=['admin'])),
):
    unregister_report_job(schedule_id)
    try:
        obj_id = ObjectId(schedule_id)
    except:
        obj_id = schedule_id
    db.report_schedules.delete_one(scoped(request, {'_id': obj_id}))
    return {'deleted': True}

@router.get('/generate/{farm_id}')
def generate_on_demand(request: Request, 
    farm_id:     str,
    window_days: int = 30,
    user = Depends(require_auth()),
):
    now   = datetime.utcnow()
    start = now - timedelta(days=window_days)

    from app.analytics.router import (
        farms_comparison, operational_efficiency,
        alert_patterns, flock_correlation,
    )
    from app.telemetry.router import get_analytics

    dummy_user = {"id": "system", "username": "system", "role": "admin"}
    
    analytics_model = get_analytics(request)
    analytics = analytics_model.dict() if hasattr(analytics_model, 'dict') else analytics_model
    comparison = farms_comparison(request, window_days=window_days, user=dummy_user)
    efficiency = operational_efficiency(request, farm_id=farm_id, window_days=window_days, user=dummy_user)
    alerts     = alert_patterns(request, farm_id=farm_id, window_days=window_days, user=dummy_user)
    flock_data = []
    
    try:
        obj_id = ObjectId(farm_id)
    except:
        obj_id = farm_id
    farm = db.farms.find_one(scoped(request, {'_id': obj_id}))

    report_data = {
        'generated_at': now.isoformat(),
        'period_start': start.isoformat(),
        'period_end':   now.isoformat(),
        'farm_name':    farm.get('name', 'Unknown Farm') if farm else 'Unknown Farm',
        'analytics':    analytics,
        'comparison':   comparison,
        'efficiency':   efficiency,
        'alert_patterns': alerts,
        'flock_data':   flock_data,
    }

    pdf_bytes = generate_farm_report(report_data, report_type='on-demand')
    filename  = f"avifarm_report_{farm_id}_{now.strftime('%Y%m%d')}.pdf"

    return Response(
        content=pdf_bytes,
        media_type='application/pdf',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )
