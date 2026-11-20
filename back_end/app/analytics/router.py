from fastapi import APIRouter, Depends, Query, HTTPException
from datetime import datetime, timedelta
from typing import Optional
from bson.objectid import ObjectId
import numpy as np

from app.auth.dependencies import require_auth

from fastapi import Request
from app.utils.tenant_query import scoped, tag, scoped_pipeline
from app.utils.quota import check_quota
from app.database import db

router = APIRouter(prefix='/analytics', tags=['Analytics'])

@router.get('/farms/comparison')
def farms_comparison(request: Request, 
    window_days: int = Query(30, ge=1, le=365),
    user = Depends(require_auth()),
):
    since = datetime.utcnow() - timedelta(days=window_days)
    
    farms = list(db.farms.find(scoped(request, {})))
    result = []
    
    for farm in farms:
        farm_id = str(farm['_id'])
        houses = list(db.houses.find(scoped(request, {'farm_id': farm_id})))
        house_ids = [str(h['_id']) for h in houses]
        
        if not house_ids:
            continue
            
        pipeline = [
            {'$match': {'house_id': {'$in': house_ids}, 'timestamp': {'$gte': since}}},
            {'$group': {
                '_id': None,
                'avg_temp':    {'$avg': '$temperature'},
                'avg_humidity':{'$avg': '$humidity'},
                'avg_ammonia': {'$avg': '$ammonia'},
                'reading_count': {'$sum': 1},
            }}
        ]
        tel = list(db.telemetry.aggregate(scoped_pipeline(request, pipeline)))
        tel = tel[0] if tel else {}
        
        alert_count = db.alerts.count_documents(scoped(request, {
            'house_id': {'$in': house_ids},
            'timestamp': {'$gte': since.isoformat()},
        }))
        
        devices = list(db.devices.find(scoped(request, {'house_id': {'$in': house_ids}})))
        cutoff  = datetime.utcnow() - timedelta(minutes=15)   # same window as the device registry
        online = 0
        for d in devices:
            last_seen = d.get('last_seen')
            if last_seen:
                if isinstance(last_seen, str):
                    try:
                        dt = datetime.fromisoformat(last_seen.replace('Z', '+00:00'))
                        if dt.replace(tzinfo=None) > cutoff:
                            online += 1
                    except:
                        pass
                elif isinstance(last_seen, datetime):
                    if last_seen > cutoff:
                        online += 1
        
        uptime  = (online / len(devices) * 100) if devices else 100
        
        total_cmds = db.control_commands.count_documents(scoped(request, {
            'house_id': {'$in': house_ids},
            'created_at': {'$gte': since.isoformat()},
        }))
        ai_cmds = db.control_commands.count_documents(scoped(request, {
            'house_id': {'$in': house_ids},
            'created_at': {'$gte': since.isoformat()},
            'operator_id': 'AI_SYSTEM',
        }))
        ai_rate = (ai_cmds / total_cmds * 100) if total_cmds else 0
        
        # Mortality of the farm's active flocks (cumulative since placement)
        active_flocks = list(db.flocks.find(scoped(request, {'house_id': {'$in': house_ids}, 'status': 'active'})))
        birds_placed = sum(int(f.get('placement_count') or 0) for f in active_flocks)
        birds_dead = 0
        if active_flocks:
            dead_agg = list(db.mortality_events.aggregate(scoped_pipeline(request, [
                {'$match': {'flock_id': {'$in': [str(f['_id']) for f in active_flocks]}}},
                {'$group': {'_id': None, 'n': {'$sum': '$count'}}},
            ])))
            birds_dead = dead_agg[0]['n'] if dead_agg else 0
        avg_mortality = round(birds_dead / birds_placed * 100, 2) if birds_placed else None

        reading_count = tel.get('reading_count', 0)
        alert_rate = (alert_count / reading_count * 100) if reading_count else 0
        risk_score = min(100, round(
            (alert_rate * 40) +
            (max(0, ((tel.get('avg_temp') or 28) - 28)) * 3) +
            (max(0, ((tel.get('avg_ammonia') or 10) - 10)) * 2)
        ))
        
        result.append({
            'farm_id':      farm_id,
            'name':         farm.get('name', 'Unknown'),
            'location':     farm.get('location', ''),
            'house_count':  len(house_ids),
            'device_count': len(devices),
            # None when the farm has no readings in the window (not a fake 0)
            'avg_temperature': round(tel['avg_temp'], 1) if tel.get('avg_temp') is not None else None,
            'avg_humidity':    round(tel['avg_humidity'], 1) if tel.get('avg_humidity') is not None else None,
            'avg_ammonia':     round(tel['avg_ammonia'], 1) if tel.get('avg_ammonia') is not None else None,
            'avg_mortality':   avg_mortality,
            'birds_placed':    birds_placed,
            'birds_dead':      birds_dead,
            'devices_online':  online,
            'ai_commands':     ai_cmds,
            'total_commands':  total_cmds,
            'alert_count':     alert_count,
            'alert_rate':      round(alert_rate, 2),
            'device_uptime':   round(uptime, 1),
            'ai_override_rate':round(ai_rate, 1),
            'risk_score':      risk_score,
            'reading_count':   reading_count,
        })
        
    return sorted(result, key=lambda x: x['risk_score'], reverse=True)

@router.get('/efficiency')
def operational_efficiency(request: Request, 
    farm_id:     Optional[str] = None,
    window_days: int = Query(30, ge=1, le=365),
    user = Depends(require_auth()),
):
    since = datetime.utcnow() - timedelta(days=window_days)
    since_str = since.isoformat()
    
    query = {'created_at': {'$gte': since_str}}
    if farm_id:
        houses = list(db.houses.find(scoped(request, {'farm_id': farm_id})))
        house_ids = [str(h['_id']) for h in houses]
        query['house_id'] = {'$in': house_ids}
        
    total_cmds = db.control_commands.count_documents(query)
    ai_query = dict(query)
    ai_query['operator_id'] = 'AI_SYSTEM'
    ai_cmds = db.control_commands.count_documents(ai_query)
    manual_cmds = total_cmds - ai_cmds
    
    reason_pipeline = [
        {'$match': {**query, 'operator_id': {'$ne': 'AI_SYSTEM'}}},
        {'$group': {'_id': '$reason', 'count': {'$sum': 1}}},
        {'$sort': {'count': -1}},
        {'$limit': 20}
    ]
    reasons = list(db.control_commands.aggregate(scoped_pipeline(request, reason_pipeline)))
    
    device_pipeline = [
        {'$match': {**query, 'operator_id': {'$ne': 'AI_SYSTEM'}}},
        {'$group': {'_id': '$device_type', 'count': {'$sum': 1}}},
        {'$sort': {'count': -1}},
        {'$limit': 20}
    ]
    by_device = list(db.control_commands.aggregate(scoped_pipeline(request, device_pipeline)))
    
    daily_pipeline = [
        {'$match': query},
        {'$addFields': {'date_obj': {'$dateFromString': {'dateString': '$created_at'}}}},
        {'$group': {
            '_id': {'$dateToString': {'format': '%Y-%m-%d', 'date': '$date_obj'}},
            'total': {'$sum': 1},
            'ai':    {'$sum': {'$cond': [{'$eq': ['$operator_id', 'AI_SYSTEM']}, 1, 0]}},
            'manual':{'$sum': {'$cond': [{'$ne': ['$operator_id', 'AI_SYSTEM']}, 1, 0]}},
        }},
        {'$sort': {'_id': 1}},
        {'$limit': 365}
    ]
    daily = list(db.control_commands.aggregate(scoped_pipeline(request, daily_pipeline)))
    
    ai_rate = (ai_cmds / total_cmds * 100) if total_cmds else 0
    
    return {
        'total_commands':    total_cmds,
        'ai_commands':       ai_cmds,
        'manual_commands':   manual_cmds,
        'ai_automation_rate':round(ai_rate, 1),
        'override_reasons':  [{'reason': r['_id'] or 'unspecified', 'count': r['count']} for r in reasons],
        'overrides_by_device':[{'device': d['_id'] or 'unknown', 'count': d['count']} for d in by_device],
        'daily_trend':       [{'date': d['_id'], 'total': d['total'], 'ai': d['ai'], 'manual': d['manual']} for d in daily],
        'window_days':       window_days,
    }

@router.get('/alert-patterns')
def alert_patterns(request: Request, 
    farm_id:     Optional[str] = None,
    window_days: int = Query(30, ge=1, le=365),
    user = Depends(require_auth()),
):
    since = datetime.utcnow() - timedelta(days=window_days)
    match = {'timestamp': {'$gte': since.isoformat()}}
    
    if farm_id:
        houses = list(db.houses.find(scoped(request, {'farm_id': farm_id})))
        house_ids = [str(h['_id']) for h in houses]
        match['house_id'] = {'$in': house_ids}
        
    hour_pipeline = [
        {'$match': match},
        {'$addFields': {'date_obj': {'$dateFromString': {'dateString': '$timestamp'}}}},
        {'$group': {
            '_id': {'$hour': '$date_obj'},
            'count': {'$sum': 1},
        }},
        {'$sort': {'_id': 1}},
    ]
    by_hour = list(db.alerts.aggregate(scoped_pipeline(request, hour_pipeline)))
    hour_data = {str(i): 0 for i in range(24)}
    for h in by_hour:
        if h['_id'] is not None:
            hour_data[str(h['_id'])] = h['count']
        
    dow_pipeline = [
        {'$match': match},
        {'$addFields': {'date_obj': {'$dateFromString': {'dateString': '$timestamp'}}}},
        {'$group': {
            '_id': {'$dayOfWeek': '$date_obj'},
            'count': {'$sum': 1},
        }},
        {'$sort': {'_id': 1}},
    ]
    by_dow = list(db.alerts.aggregate(scoped_pipeline(request, dow_pipeline)))
    
    metric_pipeline = [
        {'$match': match},
        {'$group': {'_id': '$metric', 'count': {'$sum': 1}}},
        {'$sort': {'count': -1}},
        {'$limit': 10}
    ]
    by_metric = list(db.alerts.aggregate(scoped_pipeline(request, metric_pipeline)))
    
    severity_pipeline = [
        {'$match': match},
        {'$group': {'_id': '$type', 'count': {'$sum': 1}}},
        {'$limit': 5}
    ]
    by_severity = list(db.alerts.aggregate(scoped_pipeline(request, severity_pipeline)))
    
    device_pipeline = [
        {'$match': match},
        {'$group': {'_id': '$device_id', 'count': {'$sum': 1}, 'house_id': {'$first': '$house_id'}}},
        {'$sort': {'count': -1}},
        {'$limit': 10},
    ]
    top_devices = list(db.alerts.aggregate(scoped_pipeline(request, device_pipeline)))
    
    daily_pipeline = [
        {'$match': match},
        {'$addFields': {'date_obj': {'$dateFromString': {'dateString': '$timestamp'}}}},
        {'$group': {
            '_id': {'$dateToString': {'format': '%Y-%m-%d', 'date': '$date_obj'}},
            'count':    {'$sum': 1},
            'critical': {'$sum': {'$cond': [{'$regexMatch': {'input': '$type', 'regex': 'danger|critical', 'options': 'i'}}, 1, 0]}},
            'warning':  {'$sum': {'$cond': [{'$regexMatch': {'input': '$type', 'regex': 'warning', 'options': 'i'}}, 1, 0]}},
        }},
        {'$sort': {'_id': 1}},
        {'$limit': 365}
    ]
    daily = list(db.alerts.aggregate(scoped_pipeline(request, daily_pipeline)))
    
    return {
        'total_alerts': sum(h['count'] for h in by_hour),
        'by_hour':      [{'hour': i, 'count': hour_data[str(i)]} for i in range(24)],
        'by_day_of_week': [{'dow': d['_id'], 'count': d['count']} for d in by_dow],
        'by_metric':    [{'metric': m['_id'], 'count': m['count']} for m in by_metric],
        'by_severity':  [{'severity': s['_id'], 'count': s['count']} for s in by_severity],
        'top_devices':  [{'device_id': d['_id'], 'house_id': d.get('house_id'), 'count': d['count']} for d in top_devices],
        'daily_trend':  [{'date': d['_id'], 'count': d['count'], 'critical': d['critical'], 'warning': d['warning']} for d in daily],
        'window_days':  window_days,
    }

@router.get('/flock-correlation')
def flock_correlation(request: Request, 
    flock_id:    Optional[str] = None,
    house_id:    Optional[str] = None,
    window_days: int = Query(42, ge=7, le=365),
    user = Depends(require_auth()),
):
    since = datetime.utcnow() - timedelta(days=window_days)
    
    flock_query = {}
    if flock_id:
        try:
            flock_query['_id'] = ObjectId(flock_id)
        except:
            flock_query['_id'] = flock_id
    elif house_id:
        flock_query['house_id'] = house_id
        flock_query['status'] = 'active'
        
    if not flock_query:
        raise HTTPException(status_code=400, detail="Must provide flock_id or house_id")
        
    flock = db.flocks.find_one(scoped(request, flock_query))
    if not flock:
        return {'error': 'No flock found'}
        
    f_id = str(flock['_id'])
    h_id = flock.get('house_id')
    
    placement = flock.get('placement_date')
    if isinstance(placement, str):
        try:
            placement = datetime.fromisoformat(placement.replace('Z', '+00:00')).replace(tzinfo=None)
        except:
            placement = datetime.utcnow() - timedelta(days=30)
    elif not placement:
        placement = datetime.utcnow() - timedelta(days=30)
        
    env_pipeline = [
        {'$match': {'house_id': h_id, 'timestamp': {'$gte': placement}}},
        {'$group': {
            '_id': {'$dateToString': {'format': '%Y-%m-%d', 'date': '$timestamp'}},
            'avg_temp':    {'$avg': '$temperature'},
            'avg_humidity':{'$avg': '$humidity'},
            'avg_ammonia': {'$avg': '$ammonia'},
            'max_temp':    {'$max': '$temperature'},
            'min_temp':    {'$min': '$temperature'},
        }},
        {'$sort': {'_id': 1}},
        {'$limit': 365}
    ]
    env_daily = {e['_id']: e for e in list(db.telemetry.aggregate(scoped_pipeline(request, env_pipeline)))}
    
    weight_entries = list(db.flock_entries.find(scoped(request, {
        'flock_id': f_id,
        'entry_type': 'weight',
    })).sort('recorded_at', 1))
    
    mort_pipeline = [
        {'$match': {'flock_id': f_id}},
        {'$group': {
            '_id': {'$dateToString': {'format': '%Y-%m-%d', 'date': '$detected_at'}},
            'count': {'$sum': '$count'},
        }},
    ]
    mort_daily = {m['_id']: m['count'] for m in list(db.mortality_events.aggregate(scoped_pipeline(request, mort_pipeline)))}
    
    corr_data = []
    cumulative_mort = 0
    
    for i, (date_str, env) in enumerate(env_daily.items()):
        try:
            dt = datetime.strptime(date_str, '%Y-%m-%d')
            day_num = (dt - placement).days
        except:
            day_num = i
            
        daily_mort = mort_daily.get(date_str, 0)
        cumulative_mort += daily_mort
        
        weight = next(
            (e.get('value') for e in weight_entries if e.get('day') == day_num),
            None
        )
        
        corr_data.append({
            'date':          date_str,
            'day':           day_num,
            'avg_temp':      round(env.get('avg_temp', 0) or 0, 1),
            'avg_humidity':  round(env.get('avg_humidity', 0) or 0, 1),
            'avg_ammonia':   round(env.get('avg_ammonia', 0) or 0, 1),
            'max_temp':      round(env.get('max_temp', 0) or 0, 1),
            'min_temp':      round(env.get('min_temp', 0) or 0, 1),
            'weight_g':      weight,
            'daily_mortality': daily_mort,
            'cumulative_mortality': cumulative_mort,
        })
        
    temps    = [d['avg_temp']    for d in corr_data]
    ammonias = [d['avg_ammonia'] for d in corr_data]
    weights  = [d['weight_g'] or 0 for d in corr_data]
    morts    = [d['daily_mortality'] for d in corr_data]
    
    def pearson(x, y):
        if len(x) < 3: return None
        try:
            corr = float(np.corrcoef(x, y)[0, 1])
            return round(corr, 3) if not np.isnan(corr) else None
        except: return None
        
    return {
        'flock_id':    f_id,
        'house_id':    h_id,
        'breed':       flock.get('breed'),
        'placement_date': placement.isoformat(),
        'age_days':    (datetime.utcnow() - placement).days,
        'daily_data':  corr_data,
        'correlations': {
            'temp_vs_mortality':   pearson(temps, morts),
            'ammonia_vs_mortality':pearson(ammonias, morts),
            'temp_vs_weight':      pearson(temps, weights),
            'ammonia_vs_weight':   pearson(ammonias, weights),
        },
    }
