import os
os.environ["PYTHONPATH"] = "."
from app.ai.predictor import get_predictions
from app.ai.control_loop import evaluate_predictions

# Using the REAL active house ID found in telemetry
HOUSE_ID = 'b0c0b4e3-4abf-45e7-86e7-31ce63ae9a20'

print(f"--- AI Diagnostic for House: {HOUSE_ID} ---")
preds = get_predictions(HOUSE_ID)

if not preds or 'predictions' not in preds:
    print("[ERROR] No predictions generated. Check if telemetry data exists.")
else:
    metrics = preds['predictions']
    print(f"[OK] Metrics analyzed: {list(metrics.keys())}")
    
    for m, p in metrics.items():
        avail = p.get('available', False)
        conf = p.get('confidence', 'N/A')
        curr = p.get('current_value')
        rate = p.get('rate_per_minute', 0)
        will_warn = p.get('will_breach_warn', False)
        will_danger = p.get('will_breach_danger', False)
        
        curr_str = f"{curr:.2f}" if curr is not None else "None"
        print(f" - {m.upper()}: Curr={curr_str}, Rate={rate:+.4f}, Warn={will_warn}, Danger={will_danger}, Conf={conf}")

    decisions = evaluate_predictions(HOUSE_ID, preds)
    print(f"\nAI Decisions Made: {len(decisions)}")
    if not decisions:
        print("   (Reason: AI thinks metrics are stable or improving)")
    for d in decisions:
        print(f" [ACTION] {d.device_type} -> {d.command}")
        print(f"    REASON: {d.reason}")

print("--- Diagnostic Complete ---")
