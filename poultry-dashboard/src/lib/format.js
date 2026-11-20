// Display helpers for the sentence-case UI (FXGate style).

const ACRONYMS = new Set(['ai', 'id', 'pdf', 'kpi', 'thi', 'co2', 'nh3', 'mqtt', 'api', 'esp32', 'utc', 'fcr', 'epef', 'ok', 'iot']);

/** "heater_on" / "HIGH" / "ai_system" → "Heater on" / "High" / "AI system". Empty for null/undefined. */
export function sentence(value) {
  if (value == null) return '';
  const words = String(value).replace(/[_]+/g, ' ').trim().toLowerCase().split(/\s+/);
  return words
    .map((w, i) => (ACRONYMS.has(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}
