import { useHouseDevices } from '../hooks/useHouseDevices';
import { sentence } from '../lib/format';

export default function HouseStatusBar({ house, selected, onSelect }) {
  const { sensors, loading } = useHouseDevices(house._id || house.house_id);

  // Derive avg readings from all sensors in the house
  const aggs = { temp: [], hum: [], nh3: [] };
  sensors.forEach(s => {
    if (s.latest_reading?.temperature != null) aggs.temp.push(s.latest_reading.temperature);
    if (s.latest_reading?.humidity != null)    aggs.hum.push(s.latest_reading.humidity);
    if (s.latest_reading?.ammonia != null)     aggs.nh3.push(s.latest_reading.ammonia);
  });

  const getAvg = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
  const temp = getAvg(aggs.temp);
  const hum  = getAvg(aggs.hum);
  const nh3  = getAvg(aggs.nh3);

  // Status computation for outer border
  const hasDanger = temp >= 35 || hum >= 85 || nh3 >= 25;
  const hasWarn   = temp >= 32 || hum >= 75 || nh3 >= 15;
  const status    = hasDanger ? 'danger' : hasWarn ? 'warn' : 'ok';
  const color     = `var(--${status})`;

  return (
    <div
      onClick={onSelect}
      className="panel"
      style={{
        padding: '12px 18px',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderLeft: `4px solid ${color}`,
        borderColor: selected ? color : 'var(--border-dim)',
        backgroundColor: selected ? `var(--${status}-glow)` : 'var(--bg-panel)',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* House name */}
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            HOUSE {house.house_code || house.name}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
            {sensors.length} sensors
          </div>
        </div>

        <div style={{ width: 1, height: 24, backgroundColor: 'var(--border-dim)' }} />

        {/* Aggregated KPI Strip */}
        <div style={{ display: 'flex', gap: 24 }}>
          {/* Temp */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Temp</span>
            {loading ? <div style={{ width: 40, height: 16, background: 'var(--bg-surface)' }} /> : (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: temp >= 35 ? 'var(--danger)' : temp >= 32 ? 'var(--warn)' : 'var(--ok)' }}>
                {temp != null ? `${temp.toFixed(1)}°` : '—'}
              </span>
            )}
          </div>
          {/* Hum */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Humidity</span>
            {loading ? <div style={{ width: 40, height: 16, background: 'var(--bg-surface)' }} /> : (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: hum >= 85 ? 'var(--danger)' : hum >= 75 ? 'var(--warn)' : 'var(--info)' }}>
                {hum != null ? `${hum.toFixed(1)}%` : '—'}
              </span>
            )}
          </div>
          {/* NH3 */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Ammonia</span>
            {loading ? <div style={{ width: 40, height: 16, background: 'var(--bg-surface)' }} /> : (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: nh3 >= 25 ? 'var(--danger)' : nh3 >= 15 ? 'var(--warn)' : 'var(--warn)' }}>
                {nh3 != null ? `${nh3.toFixed(1)}p` : '—'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
         <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color, fontWeight: 600, letterSpacing: '0.05em' }}>
           {sentence(status)}
         </span>
         <span style={{ color: 'var(--text-dim)' }}>
           {selected ? '▼' : '▶'}
         </span>
      </div>
    </div>
  );
}
