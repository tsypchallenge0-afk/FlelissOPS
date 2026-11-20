def compute_kpis(flock: dict, entries: list, mortality_events: list) -> dict:
    """
    Compute all flock KPIs from raw entries.
    """
    from datetime import datetime
    import math

    placement_count = flock.get('placement_count', 0)
    placement_date  = flock.get('placement_date')
    if not placement_date:
        placement_date = flock.get('created_at', datetime.utcnow())
        
    today           = datetime.utcnow()
    # Check if placement_date is string instead of datetime
    if isinstance(placement_date, str):
        try:
            placement_date = datetime.fromisoformat(placement_date.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            placement_date = today

    age_days        = max(0, (today - placement_date).days)

    # Current live count
    total_mortality = sum(e.get('count', 0) for e in mortality_events)
    live_count      = placement_count - total_mortality
    mortality_rate  = (total_mortality / placement_count * 100) if placement_count else 0

    # Weight entries — average per day
    weight_entries = [e for e in entries if e.get('entry_type') == 'weight']
    latest_weight  = None
    adg            = None
    if weight_entries:
        latest = max(weight_entries, key=lambda e: e.get('day', 0))
        latest_weight = latest.get('value')  # grams
        if latest.get('day', 0) > 0:
            adg = latest_weight / latest['day']  # g/day

    # Feed entries — cumulative total
    feed_entries  = [e for e in entries if e.get('entry_type') == 'feed']
    total_feed_kg = sum(e.get('value', 0) for e in feed_entries)

    # FCR = total feed consumed (kg) / total weight gain (kg)
    fcr = None
    if latest_weight and total_feed_kg and live_count:
        total_weight_gain_kg = (latest_weight * live_count) / 1000
        fcr = round(total_feed_kg / total_weight_gain_kg, 3) if total_weight_gain_kg else None

    # Projected slaughter weight
    projected_weight = None
    target_age_days = flock.get('target_age_days', 42)
    if adg and target_age_days:
        days_remaining  = target_age_days - age_days
        projected_weight = (latest_weight or 0) + adg * days_remaining

    # European Production Efficiency Factor (EPEF)
    epef = None
    if latest_weight and fcr and fcr > 0 and mortality_rate is not None and age_days:
        survival_rate = 100 - mortality_rate
        epef = round(
            (survival_rate * (latest_weight / 1000) * 100) / (fcr * age_days),
            1
        )

    # Standard weight comparison
    from app.flock.standards import get_standard_weight, get_full_standard_curve
    breed = flock.get('breed', 'Ross 308')
    standard_weight_g = get_standard_weight(breed, age_days)
    
    growth_deviation_pct = None
    if latest_weight and standard_weight_g:
        growth_deviation_pct = round(((latest_weight / standard_weight_g) - 1) * 100, 1)

    return {
        'flock_id':         str(flock.get('_id', '')),
        'age_days':         age_days,
        'placement_count':  placement_count,
        'live_count':       live_count,
        'total_mortality':  total_mortality,
        'mortality_rate':   round(mortality_rate, 2),
        'latest_weight_g':  latest_weight,
        'standard_weight_g': round(standard_weight_g),
        'growth_deviation_pct': growth_deviation_pct,
        'adg_g':            round(adg, 1) if adg else None,
        'total_feed_kg':    round(total_feed_kg, 1),
        'fcr':              fcr,
        'projected_weight_g': round(projected_weight) if projected_weight else None,
        'epef':             epef,
        'days_to_target':   max(0, (int(target_age_days) - age_days)),
        'standard_curve':   get_full_standard_curve(breed, int(target_age_days))
    }
