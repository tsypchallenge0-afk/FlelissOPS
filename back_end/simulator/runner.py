import asyncio
import random
import logging
import sys
import os
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s %(name)s: %(message)s',
    datefmt='%H:%M:%S',
)

from .config import (
    HOUSES, HOUSE_DEVICES, READINGS_PER_MINUTE, SIMULATION_SPEED,
    BACKFILL_DAYS, BACKFILL_INTERVAL_SECONDS,
)
from .physics import generate_reading
from .anomaly_injector import maybe_inject_fault, apply_fault
from .writer import write_readings, WRITE_MODE


async def backfill_history():
    """
    Generate BACKFILL_DAYS days of historical readings and write them.
    Run once on first startup to give the AI enough data to train on.
    Skips if a backfill marker file exists.
    """
    marker = 'simulator/.backfill_done'
    if os.path.exists(marker):
        logger.info('Backfill already done — skipping')
        return

    logger.info(
        f'Starting backfill: {BACKFILL_DAYS} days × '
        f'{len(HOUSES)} houses × '
        f'{1440 // (BACKFILL_INTERVAL_SECONDS // 60) if BACKFILL_INTERVAL_SECONDS >= 60 else 1440 * (60 // BACKFILL_INTERVAL_SECONDS)} readings/day'
    )

    start = datetime.utcnow() - timedelta(days=BACKFILL_DAYS)
    now   = datetime.utcnow()
    dt    = start
    batch = []
    count = 0

    # For backfill, use DB mode if explicitly configured or as a fallback for speed,
    # but follow WRITE_MODE unless it's too slow.
    # Actually, backfill is usually better as a direct DB write.
    
    while dt < now:
        for house in HOUSES:
            reading = generate_reading(house, dt)
            # No fault injection during backfill — clean baseline data
            batch.append(reading)

        # Write in batches for performance
        if len(batch) >= 100:
            await write_readings(batch)
            count += len(batch)
            batch = []
            if count % 1000 == 0:
                logger.info(
                    f'Backfill progress: {(dt - start).days}d / {BACKFILL_DAYS}d '
                    f'({count} readings written)'
                )

        dt += timedelta(seconds=BACKFILL_INTERVAL_SECONDS)

    # Write remainder
    if batch:
        await write_readings(batch)
        count += len(batch)

    # Mark backfill complete
    with open(marker, 'w') as f:
        f.write(datetime.utcnow().isoformat())

    logger.info(f'Backfill complete: {count} total readings written')


async def live_simulation_loop():
    """
    Continuously generates and writes live readings.
    One reading per house per minute (by default).
    """
    interval = 60.0 / READINGS_PER_MINUTE / SIMULATION_SPEED
    logger.info(
        f'Live simulation started: {len(HOUSES)} houses, '
        f'interval={interval:.1f}s, speed={SIMULATION_SPEED}x'
    )

    while True:
        dt = datetime.utcnow()
        readings = []

        for house in HOUSES:
            # Maybe inject a fault
            maybe_inject_fault(house.house_id, dt)

            # Generate base reading
            reading = generate_reading(house, dt)

            # Apply any active fault
            reading = apply_fault(reading, house.house_id, dt)

            # One reading per sensor in the house (device_id lets the backend mark it online
            # and place it on the spatial view). Sensors are spread front → back, and the
            # back (fan end) runs slightly warmer and drier, like a tunnel-ventilated house.
            devices = HOUSE_DEVICES.get(house.house_id) or [None]
            for i, dev in enumerate(devices):
                r = dict(reading)
                if dev:
                    pos = (i - (len(devices) - 1) / 2) if len(devices) > 1 else 0
                    r['device_id']   = dev
                    r['temperature'] = round(r['temperature'] + 0.9 * pos + random.gauss(0, 0.15), 2)
                    r['humidity']    = round(r['humidity'] - 1.5 * pos + random.gauss(0, 0.4), 2)
                    r['ammonia']     = round(max(0.0, r['ammonia'] + 0.6 * pos), 2)
                readings.append(r)

        await write_readings(readings)

        # Log summary every 10 minutes
        if dt.minute % 10 == 0 and dt.second < int(interval + 1):
            logger.info(
                f'Live sim: {len(readings)} readings at '
                f'{dt.strftime("%H:%M:%S")} UTC'
            )

        await asyncio.sleep(interval)


async def main():
    """
    Entry point.
    Pass --backfill to run historical data generation first.
    Pass --live to run live simulation only.
    Pass --both (default) to backfill then go live.
    """
    mode = sys.argv[1] if len(sys.argv) > 1 else '--both'

    if mode in ('--backfill', '--both'):
        await backfill_history()

    if mode in ('--live', '--both'):
        await live_simulation_loop()


if __name__ == '__main__':
    asyncio.run(main())
