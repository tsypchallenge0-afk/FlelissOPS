BREED_STANDARDS = {
    "Ross 308": {
        "weight_g": {
            0: 42, 1: 55, 2: 70, 3: 87, 4: 106, 5: 128, 6: 152, 7: 179,
            8: 209, 9: 242, 10: 278, 11: 318, 12: 361, 13: 407, 14: 458,
            15: 512, 16: 570, 17: 632, 18: 698, 19: 769, 20: 844, 21: 923,
            22: 1007, 23: 1096, 24: 1189, 25: 1286, 26: 1388, 27: 1494, 28: 1605,
            29: 1720, 30: 1839, 31: 1962, 32: 2088, 33: 2218, 34: 2352, 35: 2488,
            36: 2628, 37: 2771, 38: 2916, 39: 3064, 40: 3214, 41: 3365, 42: 3518
        }
    },
    "Cobb 500": {
        "weight_g": {
            0: 42, 7: 182, 14: 468, 21: 945, 28: 1620, 35: 2430, 42: 3450
        }
    }
}

def get_standard_weight(breed: str, day: int) -> float:
    """
    Returns the standard weight for a breed at a specific day.
    Uses linear interpolation if day is between keys.
    """
    standard = BREED_STANDARDS.get(breed)
    if not standard:
        # Fallback to Ross 308 if breed unknown
        standard = BREED_STANDARDS["Ross 308"]
    
    weights = standard["weight_g"]
    if day in weights:
        return float(weights[day])
    
    # Interpolation
    sorted_days = sorted(weights.keys())
    if day <= sorted_days[0]: return float(weights[sorted_days[0]])
    if day >= sorted_days[-1]: return float(weights[sorted_days[-1]])
    
    # Find surrounding days
    for i in range(len(sorted_days) - 1):
        d1, d2 = sorted_days[i], sorted_days[i+1]
        if d1 < day < d2:
            w1, w2 = weights[d1], weights[d2]
            # Linear interp: y = y1 + (x - x1) * (y2 - y1) / (x2 - x1)
            return w1 + (day - d1) * (w2 - w1) / (d2 - d1)
            
    return 0.0

def get_full_standard_curve(breed: str, max_days: int = 42) -> list:
    """
    Returns a list of day-by-day standard weights for plotting.
    """
    return [{"day": d, "standard_weight": get_standard_weight(breed, d)} for d in range(max_days + 1)]
