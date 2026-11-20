from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from bson.objectid import ObjectId
import asyncio

from app.auth.dependencies import require_auth
from app.utils.tenant_query import scoped, tag
from app.database import db
from .interpolator import interpolate_setpoints
from .setpoint_controller import apply_setpoints_now

router = APIRouter(prefix='/flocks', tags=['Setpoint Curves'])

# ── Schemas ────────────────────────────────────────────────────────────────

class Checkpoint(BaseModel):
    day:              int
    label:            str
    # Nutritional
    female_weight_g:  Optional[float] = None
    female_feed_g:    Optional[float] = None
    female_water_ml:  Optional[float] = None
    male_weight_g:    Optional[float] = None
    male_feed_g:      Optional[float] = None
    male_water_ml:    Optional[float] = None
    # Environmental
    temperature_c:    Optional[float] = None
    humidity_pct:     Optional[float] = None
    air_requirement:  Optional[float] = None
    co2_ppm:          Optional[float] = None


class CurveCreate(BaseModel):
    curve_type:    str              # 'nutritional' | 'environmental'
    checkpoints:   List[Checkpoint]
    is_template:   bool = False
    template_name: Optional[str] = None
    breed:         Optional[str] = None


class CurveUpdate(BaseModel):
    checkpoints: List[Checkpoint]


def _trigger_setpoints(flock_id: str):
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(apply_setpoints_now(flock_id))
    except RuntimeError:
        # If no running loop, create one temporarily or ignore
        pass

def to_dict(doc):
    if not doc: return None
    doc["id"] = str(doc.pop("_id", ""))
    return doc

# ── Flock curve endpoints ──────────────────────────────────────────────────

@router.get('/{flock_id}/curves')
def get_flock_curves(
    flock_id: str,
    request:  Request,
    user = Depends(require_auth()),
):
    """Returns both nutritional and environmental curves for a flock."""
    curves = list(db.flock_setpoint_curves.find(
        scoped(request, {'flock_id': flock_id})
    ).limit(10))
    return [to_dict(c) for c in curves]


@router.post('/{flock_id}/curves')
def create_flock_curve(
    flock_id: str,
    payload:  CurveCreate,
    request:  Request,
    user = Depends(require_auth(roles=['supervisor', 'admin'])),
):
    """
    Create or replace a curve for a flock.
    Called during flock creation or when editing curves post-placement.
    If a curve of the same type already exists, it is replaced.
    """
    # Verify flock belongs to this tenant
    try:
        flock_query = {'_id': ObjectId(flock_id)}
    except:
        flock_query = {'_id': flock_id}
        
    flock = db.flocks.find_one(scoped(request, flock_query))
    if not flock:
        flock = db.flocks.find_one(scoped(request, {'flock_id': flock_id}))
        if not flock:
            raise HTTPException(status_code=404, detail='Flock not found')

    # Delete existing curve of same type
    db.flock_setpoint_curves.delete_many(
        scoped(request, {'flock_id': flock_id, 'curve_type': payload.curve_type})
    )

    # Sort checkpoints by day
    checkpoints = sorted([c.dict() for c in payload.checkpoints], key=lambda x: x['day'])

    doc = tag(request, {
        'flock_id':     flock_id,
        'house_id':     flock.get('house_id'),
        'curve_type':   payload.curve_type,
        'checkpoints':  checkpoints,
        'is_template':  False,
        'created_by':   user.get('id', user.get('_id')),
        'created_at':   datetime.utcnow().isoformat(),
        'updated_at':   datetime.utcnow().isoformat(),
    })
    result = db.flock_setpoint_curves.insert_one(doc)
    doc['_id'] = result.inserted_id
    
    # Trigger immediate setpoint application
    _trigger_setpoints(flock_id)
    return to_dict(doc)


@router.patch('/{flock_id}/curves/{curve_type}')
def update_flock_curve(
    flock_id:   str,
    curve_type: str,
    payload:    CurveUpdate,
    request:    Request,
    user = Depends(require_auth(roles=['supervisor', 'admin'])),
):
    """
    Update checkpoints in an existing curve.
    Triggers immediate recalculation and setpoint application.
    """
    checkpoints = sorted([c.dict() for c in payload.checkpoints], key=lambda x: x['day'])
    db.flock_setpoint_curves.update_one(
        scoped(request, {'flock_id': flock_id, 'curve_type': curve_type}),
        {'$set': {'checkpoints': checkpoints, 'updated_at': datetime.utcnow().isoformat()}}
    )
    _trigger_setpoints(flock_id)
    return {'updated': True}


@router.get('/{flock_id}/setpoints/today')
def get_todays_setpoints(
    flock_id: str,
    request:  Request,
    user = Depends(require_auth()),
):
    """
    Returns the interpolated setpoints for the current day of the grow-out.
    This is what the AI control loop uses.
    """
    try:
        flock_query = {'_id': ObjectId(flock_id)}
    except:
        flock_query = {'_id': flock_id}
        
    flock = db.flocks.find_one(flock_query)
    if not flock:
        flock = db.flocks.find_one({'flock_id': flock_id})
        
    if not flock:
        raise HTTPException(status_code=404, detail='Flock not found')
        
    placement_date = flock.get('placement_date')
    if isinstance(placement_date, str):
        pd = datetime.fromisoformat(placement_date.replace("Z", "+00:00")).replace(tzinfo=None)
    else:
        pd = placement_date
        
    age_days = (datetime.utcnow() - pd).days if pd else 0
    curves = list(db.flock_setpoint_curves.find({'flock_id': flock_id}).limit(10))
    
    result = {}
    for curve in curves:
        interp = interpolate_setpoints(curve['checkpoints'], age_days)
        result[curve['curve_type']] = interp
        
    return {'flock_id': flock_id, 'age_days': age_days, 'setpoints': result}


# ── Template endpoints ─────────────────────────────────────────────────────

@router.get('/curve-templates')
def list_templates(
    curve_type: Optional[str] = None,
    request:    Request = None,
    user = Depends(require_auth()),
):
    """List all reusable curve templates for this tenant."""
    query = scoped(request, {})
    if curve_type:
        query['curve_type'] = curve_type
        
    templates = list(db.setpoint_curve_templates.find(query).limit(100))
    return [to_dict(t) for t in templates]


@router.post('/curve-templates')
def save_as_template(
    payload: CurveCreate,
    request: Request,
    user = Depends(require_auth(roles=['supervisor', 'admin'])),
):
    """Save a curve as a reusable template."""
    doc = tag(request, {
        **payload.dict(),
        'is_template': True,
        'created_by':  user.get('id', user.get('_id')),
        'created_at':  datetime.utcnow().isoformat(),
    })
    result = db.setpoint_curve_templates.insert_one(doc)
    doc['_id'] = result.inserted_id
    return to_dict(doc)
