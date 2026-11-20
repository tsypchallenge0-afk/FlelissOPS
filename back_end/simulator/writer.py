import logging
import asyncio
from datetime import datetime
from typing import List
from app.database import db

logger = logging.getLogger(__name__)

# ── CHOOSE YOUR WRITE MODE ──────────────────────────────────────────────────
# Mode A: Write directly to your DB (recommended — fastest, no HTTP overhead)
# Mode B: POST to your existing telemetry ingestion endpoint (most realistic)
#
# Set WRITE_MODE below. If your existing POST /telemetry endpoint already
# handles ingestion and WebSocket broadcasting, use Mode B.
# If you want to seed historical data fast, use Mode A.
# ─────────────────────────────────────────────────────────────────────────────

WRITE_MODE = 'http'    # 'http' | 'db'
INGEST_URL = 'http://127.0.0.1:9000/telemetry'

# ── MODE A: Direct DB write ──────────────────────────────────────────────────
# Adapt this to your existing DB connection and ORM.

async def _write_to_db(readings: List[dict]):
    """
    Insert readings directly into your telemetry table.
    """
    try:
        # Convert ISO strings back to datetime objects for MongoDB
        formatted_readings = []
        for r in readings:
            doc = r.copy()
            if isinstance(doc['timestamp'], str):
                doc['timestamp'] = datetime.fromisoformat(doc['timestamp'])
            formatted_readings.append(doc)
        
        if formatted_readings:
            db.telemetry.insert_many(formatted_readings)
    except Exception as e:
        logger.error(f'DB write error: {e}')


# ── MODE B: HTTP POST ─────────────────────────────────────────────────────────
# Posts to your existing telemetry ingestion endpoint.

async def _write_via_http(readings: List[dict]):
    import aiohttp
    async with aiohttp.ClientSession() as session:
        for reading in readings:
            try:
                async with session.post(
                    INGEST_URL,
                    json=reading,
                    headers={'Content-Type': 'application/json'},
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    if resp.status not in (200, 201):
                        body = await resp.text()
                        logger.warning(
                            f'Write failed for {reading["house_id"]}: '
                            f'HTTP {resp.status} — {body[:100]}'
                        )
            except Exception as e:
                logger.error(f'HTTP write error: {e}')


# ── Public write function ─────────────────────────────────────────────────────

async def write_readings(readings: List[dict]):
    if not readings:
        return
    if WRITE_MODE == 'db':
        await _write_to_db(readings)
    else:
        await _write_via_http(readings)
    logger.debug(f'Wrote {len(readings)} readings')
