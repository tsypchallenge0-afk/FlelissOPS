from typing import Optional

def interpolate_setpoints(checkpoints: list, age_days: int) -> dict:
    """
    Given a list of checkpoints sorted by day and the current flock age,
    linearly interpolates the setpoint values for that age.

    If age_days < first checkpoint day  → use first checkpoint values
    If age_days > last checkpoint day   → use last checkpoint values
    Otherwise                           → linear interpolation between bracketing checkpoints
    """
    if not checkpoints:
        return {}

    sorted_cp = sorted(checkpoints, key=lambda c: c['day'])

    # Before first checkpoint
    if age_days <= sorted_cp[0]['day']:
        return _extract_values(sorted_cp[0])

    # After last checkpoint
    if age_days >= sorted_cp[-1]['day']:
        return _extract_values(sorted_cp[-1])

    # Find bracketing checkpoints
    lower = None
    upper = None
    for i, cp in enumerate(sorted_cp):
        if cp['day'] <= age_days:
            lower = cp
        if cp['day'] > age_days and upper is None:
            upper = cp

    if not lower or not upper:
        return _extract_values(sorted_cp[-1])

    # Linear interpolation factor
    span  = upper['day'] - lower['day']
    t     = (age_days - lower['day']) / span if span > 0 else 0

    NUMERIC_FIELDS = [
        'female_weight_g', 'female_feed_g', 'female_water_ml',
        'male_weight_g',   'male_feed_g',   'male_water_ml',
        'temperature_c',   'humidity_pct',  'air_requirement', 'co2_ppm',
    ]

    result = {'day': age_days}
    for field in NUMERIC_FIELDS:
        lv = lower.get(field)
        uv = upper.get(field)
        if lv is not None and uv is not None:
            result[field] = round(lv + (uv - lv) * t, 2)
        elif lv is not None:
            result[field] = lv
        elif uv is not None:
            result[field] = uv

    return result


def _extract_values(checkpoint: dict) -> dict:
    NUMERIC_FIELDS = [
        'female_weight_g', 'female_feed_g', 'female_water_ml',
        'male_weight_g',   'male_feed_g',   'male_water_ml',
        'temperature_c',   'humidity_pct',  'air_requirement', 'co2_ppm',
    ]
    return {
        'day': checkpoint['day'],
        **{f: checkpoint.get(f) for f in NUMERIC_FIELDS if checkpoint.get(f) is not None}
    }
