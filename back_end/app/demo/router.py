from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth.dependencies import require_auth
from app.database import db
from app.demo import scenario
from app.utils.tenant_query import scoped

router = APIRouter(prefix="/houses", tags=["Demo"])


def _house_or_404(request: Request, house_id: str) -> dict:
    house = db.houses.find_one(scoped(request, {"_id": house_id}))
    if not house:
        raise HTTPException(status_code=404, detail="House not found")
    return house


@router.post("/{house_id}/demo/heat-stress", status_code=202)
async def start_heat_stress(request: Request, house_id: str,
                            user: dict = Depends(require_auth(["supervisor", "admin"]))):
    """Start the ~1-minute heat-stress scenario (heat wave → alert → AI response → recovery)."""
    house = _house_or_404(request, house_id)
    if scenario.is_running(house_id):
        raise HTTPException(status_code=409, detail="A demo scenario is already running for this house")
    tenant_id = house.get("tenant_id") or getattr(request.state, "tenant_id", None)
    sensors = scenario.house_sensors(house_id, tenant_id)
    if not sensors:
        raise HTTPException(status_code=400, detail="This house has no sensors — register one first")
    st = scenario.start(house_id, tenant_id, sensors, user.get("username") or user.get("id"))
    return {k: v for k, v in st.items() if not k.startswith("_")}


@router.get("/{house_id}/demo/status")
def heat_stress_status(request: Request, house_id: str, user: dict = Depends(require_auth())):
    _house_or_404(request, house_id)
    return {k: v for k, v in scenario.status(house_id).items() if not k.startswith("_")}
