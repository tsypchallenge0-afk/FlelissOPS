import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .generator import generate_farm_report
from .mailer import send_report_email, build_report_email_html
from app.database import db

_scheduler: Optional[AsyncIOScheduler] = None


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler()
    return _scheduler


async def run_scheduled_report(report_config: dict):
    logger.info(f"Running scheduled report: {report_config.get('_id')}")

    try:
        now   = datetime.utcnow()
        days  = 7 if report_config.get('frequency') == 'weekly' else 30
        start = now - timedelta(days=days)

        from app.analytics.router import (
            farms_comparison, operational_efficiency,
            alert_patterns, flock_correlation,
        )
        from app.telemetry.router import get_analytics

        # Since our endpoints are defined as regular `def` functions, we can call them directly.
        # They don't require `await` because they use sync PyMongo.
        # Note: They have `user = Depends(require_auth())`, so we pass None or a dummy user directly if needed.
        # But wait! We define them with `user = Depends(...)` so calling them directly requires passing `user=None`.
        dummy_user = {"id": "system", "username": "system", "role": "admin"}
        
        analytics_model = get_analytics()
        # Convert pydantic model to dict
        analytics = analytics_model.dict() if hasattr(analytics_model, 'dict') else analytics_model
        
        comparison  = farms_comparison(window_days=days, user=dummy_user)
        efficiency  = operational_efficiency(farm_id=report_config.get('farm_id'), window_days=days, user=dummy_user)
        alerts      = alert_patterns(farm_id=report_config.get('farm_id'), window_days=days, user=dummy_user)
        
        # Get active flocks
        farm_id = report_config.get('farm_id')
        flock_query = {'status': 'active'}
        if farm_id:
            houses = list(db.houses.find({'farm_id': farm_id}))
            house_ids = [str(h['_id']) for h in houses]
            flock_query['house_id'] = {'$in': house_ids}
            
        active_flocks = list(db.flocks.find(flock_query))
        flock_data = []
        for f in active_flocks:
            flock_data.append({
                'flock_id': f.get('flock_id') or str(f['_id']),
                'breed': f.get('breed', 'Unknown'),
                'age_days': (now - (f.get('placement_date') or now)).days if isinstance(f.get('placement_date'), datetime) else 0,
                'live_count': f.get('quantity', 0),
                'mortality_rate': 0,
                'fcr': None,
                'epef': None,
            })

        report_data = {
            'generated_at': now.isoformat(),
            'period_start': start.isoformat(),
            'period_end':   now.isoformat(),
            'farm_name':    report_config.get('farm_name', 'All Farms'),
            'analytics':    analytics,
            'comparison':   comparison,
            'efficiency':   efficiency,
            'alert_patterns': alerts,
            'flock_data':   flock_data,
        }

        # Generate PDF
        pdf_bytes = generate_farm_report(
            report_data,
            report_type=report_config.get('frequency', 'weekly'),
        )

        # Build email
        subject = (
            f"AviFarm {report_config.get('frequency', 'weekly').title()} Report — "
            f"{report_config.get('farm_name', 'All Farms')} — "
            f"{now.strftime('%Y-%m-%d')}"
        )
        html = build_report_email_html(
            farm_name=report_config.get('farm_name', 'All Farms'),
            report_type=report_config.get('frequency', 'weekly'),
            period_start=start.strftime('%Y-%m-%d'),
            period_end=now.strftime('%Y-%m-%d'),
            summary=analytics,
        )
        filename = f"avifarm_report_{now.strftime('%Y%m%d')}.pdf"

        # Send
        success = await send_report_email(
            recipients=report_config.get('recipients', []),
            subject=subject,
            body_html=html,
            pdf_bytes=pdf_bytes,
            filename=filename,
        )

        if success:
            db.report_schedules.update_one(
                {'_id': report_config['_id']},
                {'$set': {'last_sent': now, 'last_status': 'success'}}
            )

    except Exception as e:
        logger.error(f"Scheduled report failed: {e}")
        db.report_schedules.update_one(
            {'_id': report_config.get('_id')},
            {'$set': {'last_status': f'error: {str(e)}'}}
        )


async def load_and_schedule_all():
    scheduler = get_scheduler()

    schedules = list(db.report_schedules.find({'enabled': True}))
    for s in schedules:
        register_report_job(s)

    if not scheduler.running:
        scheduler.start()
    logger.info('Report scheduler started')


def register_report_job(config: dict):
    scheduler = get_scheduler()
    job_id    = f"report_{config['_id']}"

    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    freq = config.get('frequency', 'weekly')

    if freq == 'weekly':
        trigger = CronTrigger(
            day_of_week=config.get('day_of_week', 'mon'),
            hour=config.get('hour', 7),
            minute=0,
        )
    elif freq == 'monthly':
        trigger = CronTrigger(
            day=config.get('day_of_month', 1),
            hour=config.get('hour', 7),
            minute=0,
        )
    else:  # daily
        trigger = CronTrigger(
            hour=config.get('hour', 7),
            minute=0,
        )

    scheduler.add_job(
        run_scheduled_report,
        trigger=trigger,
        args=[config],
        id=job_id,
        replace_existing=True,
        misfire_grace_time=3600,
    )
    logger.info(f"Scheduled report job: {job_id} ({freq})")


def unregister_report_job(config_id: str):
    scheduler = get_scheduler()
    job_id    = f"report_{config_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
