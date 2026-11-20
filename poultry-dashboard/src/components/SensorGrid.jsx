import { useMemo } from 'react';
import Skeleton from './Skeleton';
import { sentence } from '../lib/format';

// ── Metric config ──────────────────────────────────────────────────────────

const METRIC_CFG = {
  temperature: {
    label: 'Temperature', unit: '°C', color: '#e84040',
    warn: 32, danger: 35, min: 15, max: 45,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5">
        <path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z"/>
      </svg>
    ),
  },
  humidity: {
    label: 'Humidity', unit: '%RH', color: '#20a0e8',
    warn: 75, danger: 85, min: 0, max: 100,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>
      </svg>
    ),
  },
  ammonia: {
    label: 'Ammonia (NH₃)', unit: 'ppm', color: '#e8a020',
    warn: 15, danger: 25, min: 0, max: 50,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4M12 16h.01"/>
      </svg>
    ),
  },
};

// ── Utility functions ──────────────────────────────────────────────────────

function getStatus(metric, value) {
  const cfg = METRIC_CFG[metric];
  if (!cfg || value == null) return 'ok';
  if (value >= cfg.danger) return 'danger';
  if (value >= cfg.warn)   return 'warn';
  return 'ok';
}

function getStatusColor(status) {
  if (status === 'danger') return 'var(--danger)';
  if (status === 'warn')   return 'var(--warn)';
  return 'var(--ok)';
}

function getTrendArrow(readings, metric) {
  if (!readings || readings.length < 3) return null;
  const vals  = readings.slice(-5).map(r => r[metric]).filter(v => v != null);
  if (vals.length < 2) return null;
  const first = vals[0], last = vals[vals.length - 1];
  const delta = last - first;
  if (Math.abs(delta) < 0.3) return { direction: 'flat', delta };
  return { direction: delta > 0 ? 'up' : 'down', delta };
}

// ── Ring gauge ─────────────────────────────────────────────────────────────

function RingGauge({ value, min, max, warn, danger, size = 120, strokeWidth = 10 }) {
  const radius      = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value != null
    ? Math.min(1, Math.max(0, (value - min) / (max - min)))
    : 0;
  const rawWarnPct   = (warn   - min) / (max - min);
  const warnPct = isNaN(rawWarnPct) ? 0 : rawWarnPct;
  const rawDangerPct = (danger - min) / (max - min);
  const dangerPct = isNaN(rawDangerPct) ? 0 : rawDangerPct;
  const fillColor = value != null
    ? (value >= danger ? 'var(--danger)' : value >= warn ? 'var(--warn)' : 'var(--ok)')
    : 'var(--text-dim)';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        stroke="var(--bg-surface)"
        strokeWidth={strokeWidth}
      />
      {/* Warn zone */}
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        stroke="rgba(232,160,32,0.2)"
        strokeWidth={strokeWidth}
        strokeDasharray={`${(dangerPct - warnPct) * circumference} ${circumference}`}
        strokeDashoffset={-warnPct * circumference}
        transform={`rotate(-90 ${size/2} ${size/2})`}
        strokeLinecap="flat"
      />
      {/* Danger zone */}
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        stroke="rgba(232,58,32,0.2)"
        strokeWidth={strokeWidth}
        strokeDasharray={`${(1 - dangerPct) * circumference} ${circumference}`}
        strokeDashoffset={-dangerPct * circumference}
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      {/* Value fill */}
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        stroke={fillColor}
        strokeWidth={strokeWidth}
        strokeDasharray={`${pct * circumference} ${circumference}`}
        strokeDashoffset="0"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        strokeLinecap="round"
        style={{
          filter: `drop-shadow(0 0 4px ${fillColor})`,
          transition: 'stroke-dasharray 0.5s ease, stroke 0.3s ease',
        }}
      />
    </svg>
  );
}

// ── Trend arrow ────────────────────────────────────────────────────────────

function TrendArrow({ trend, unit }) {
  if (!trend) return null;
  const { direction, delta } = trend;
  const color = direction === 'up' ? 'var(--danger)'
    : direction === 'down' ? 'var(--info)'
    : 'var(--text-dim)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="2.5" strokeLinecap="round">
        {direction === 'up'   && <path d="M12 19V5M5 12l7-7 7 7"/>}
        {direction === 'down' && <path d="M12 5v14M5 12l7 7 7-7"/>}
        {direction === 'flat' && <path d="M5 12h14"/>}
      </svg>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color, letterSpacing: '0.04em',
      }}>
        {direction !== 'flat'
          ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}${unit}`
          : 'Stable'}
      </span>
    </div>
  );
}

// ── Individual sensor card ─────────────────────────────────────────────────

function SensorCard({ sensor, metric, value, readings, index }) {
  const cfg    = METRIC_CFG[metric];
  const status = getStatus(metric, value);
  const color  = getStatusColor(status);
  const trend  = getTrendArrow(readings, metric);
  const secsAgo = sensor?.latest_reading?.timestamp
    ? Math.round((Date.now() - new Date(sensor.latest_reading.timestamp)) / 1000)
    : null;

  return (
    <div
      className="panel fade-in"
      style={{
        animationDelay:  `${index * 0.06}s`,
        padding: 0,
        borderColor:     status !== 'ok' ? color : 'var(--border-dim)',
        boxShadow:       status !== 'ok' ? `0 0 24px ${color}22` : 'none',
        transition:      'all 0.3s ease',
      }}
    >
      {/* Header */}
      <div style={{
        padding:      '14px 18px 0',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: cfg.color }}>{cfg.icon}</span>
          <div>
            <div style={{
              fontFamily:    'var(--font-mono)', fontSize: 10,
              color:         'var(--text-dim)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}>
              {cfg.label}
            </div>
            {sensor?.device_id && (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                color:      'var(--text-dim)',
              }}>
                {sensor.device_id}
              </div>
            )}
          </div>
        </div>
        <span className={`status-badge ${status}`}>
          {sentence(status)}
        </span>
      </div>

      {/* Ring + value */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            20,
        padding:        '12px 18px',
      }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <RingGauge
            value={value}
            min={cfg.min}
            max={cfg.max}
            warn={cfg.warn}
            danger={cfg.danger}
            size={130}
            strokeWidth={12}
          />
          {/* Value centered in ring */}
          <div style={{
            position:       'absolute',
            inset:          0,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize:   value != null ? 28 : 20,
              color,
              lineHeight: 1,
              transition: 'color 0.3s ease',
            }}>
              {value != null ? value.toFixed(1) : '—'}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 12,
              color:      'var(--text-dim)',
              marginTop:  2,
            }}>
              {cfg.unit}
            </span>
          </div>
        </div>

        {/* Side info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Trend */}
          <div>
            <div style={{
              fontFamily:    'var(--font-mono)', fontSize: 9,
              color:         'var(--text-dim)',
              letterSpacing: '0.1em',
              marginBottom:  4,
            }}>
              Trend
            </div>
            <TrendArrow trend={trend} unit={cfg.unit} />
          </div>

          {/* Thresholds */}
          <div>
            <div style={{
              fontFamily:    'var(--font-mono)', fontSize: 9,
              color:         'var(--text-dim)',
              letterSpacing: '0.1em',
              marginBottom:  4,
            }}>
              Thresholds
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color:      'var(--warn)',
            }}>
              WARN {cfg.warn}{cfg.unit}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color:      'var(--danger)',
            }}>
              CRIT {cfg.danger}{cfg.unit}
            </div>
          </div>

          {/* Last updated */}
          {secsAgo != null && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color:      secsAgo < 60 ? 'var(--ok)'
                        : secsAgo < 300 ? 'var(--warn)'
                        : 'var(--danger)',
            }}>
              {secsAgo < 60 ? `${secsAgo}s ago`
               : secsAgo < 3600 ? `${Math.round(secsAgo/60)}m ago`
               : `${Math.round(secsAgo/3600)}h ago`}
            </div>
          )}
        </div>
      </div>

      {/* Threshold bar */}
      <div style={{ padding: '0 18px 14px' }}>
        <div style={{
          height:       6,
          background:   'var(--bg-surface)',
          borderRadius: 3,
          overflow:     'hidden',
          position:     'relative',
        }}>
          {/* Value fill */}
          <div style={{
            position:     'absolute',
            left:         0, top: 0, bottom: 0,
            width:        `${Math.min(100, (value != null && !isNaN(value))
              ? Math.max(0, ((value - cfg.min) / (cfg.max - cfg.min)) * 100)
              : 0)}%`,
            background:   color,
            borderRadius: 3,
            transition:   'width 0.5s ease, background 0.3s ease',
            boxShadow:    `0 0 6px ${color}88`,
          }} />
          {/* Warn marker */}
          <div style={{
            position:   'absolute',
            left:       `${((cfg.warn - cfg.min) / (cfg.max - cfg.min)) * 100}%`,
            top: 0, bottom: 0,
            width:      2,
            background: 'var(--warn)',
            opacity:    0.7,
          }} />
          {/* Danger marker */}
          <div style={{
            position:   'absolute',
            left:       `${((cfg.danger - cfg.min) / (cfg.max - cfg.min)) * 100}%`,
            top: 0, bottom: 0,
            width:      2,
            background: 'var(--danger)',
            opacity:    0.7,
          }} />
        </div>
        <div style={{
          display:        'flex',
          justifyContent: 'space-between',
          marginTop:      5,
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color:      'var(--text-dim)',
          }}>
            {cfg.min}{cfg.unit}
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color:      'var(--text-dim)',
          }}>
            {cfg.max}{cfg.unit}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Multi-sensor average card ──────────────────────────────────────────────

function MultiSensorCard({ sensors, metric, index }) {
  const cfg = METRIC_CFG[metric];

  const readings = sensors
    .map(s => s.latest_reading?.[metric])
    .filter(v => v != null);

  const avg = readings.length
    ? readings.reduce((a, b) => a + b, 0) / readings.length
    : null;
  const min = readings.length ? Math.min(...readings) : null;
  const max = readings.length ? Math.max(...readings) : null;

  const status = getStatus(metric, avg);
  const color  = getStatusColor(status);

  return (
    <div
      className="panel fade-in"
      style={{
        animationDelay: `${index * 0.06}s`,
        padding: 0,
        borderColor:    status !== 'ok' ? color : 'var(--border-dim)',
        boxShadow:      status !== 'ok' ? `0 0 24px ${color}22` : 'none',
      }}
    >
      <div style={{ padding: '14px 18px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: cfg.color }}>{cfg.icon}</span>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {cfg.label}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
              {sensors.length} sensors · avg
            </div>
          </div>
        </div>
        <span className={`status-badge ${status}`}>{sentence(status)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '12px 18px' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <RingGauge value={avg} min={cfg.min} max={cfg.max} warn={cfg.warn} danger={cfg.danger} size={130} strokeWidth={12} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: avg != null ? 28 : 20, color, lineHeight: 1 }}>
              {avg != null ? avg.toFixed(1) : '—'}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
              {cfg.unit}
            </span>
          </div>
        </div>

        {/* Per-sensor breakdown */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sensors.map((s, i) => {
            const v = s.latest_reading?.[metric];
            const sc = getStatus(metric, v);
            const sc2 = getStatusColor(sc);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc2, flexShrink: 0, boxShadow: `0 0 4px ${sc2}` }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', width: 70, flexShrink: 0 }}>
                  {s.device_id ?? `S${i+1}`}
                </span>
                <div style={{ flex: 1, height: 4, background: 'var(--bg-surface)', borderRadius: 2 }}>
                  <div style={{
                    height: '100%',
                    width: `${v != null ? Math.min(100, ((v - cfg.min) / (cfg.max - cfg.min)) * 100) : 0}%`,
                    background: sc2, borderRadius: 2,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: sc2, width: 52, textAlign: 'right', flexShrink: 0 }}>
                  {v != null ? `${v.toFixed(1)}${cfg.unit}` : '—'}
                </span>
              </div>
            );
          })}
          {min != null && max != null && (
            <div style={{ display: 'flex', gap: 12, marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--border-dim)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                Min <span style={{ color: 'var(--info)' }}>{min.toFixed(1)}{cfg.unit}</span>
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                Max <span style={{ color: 'var(--danger)' }}>{max.toFixed(1)}{cfg.unit}</span>
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                Spread <span style={{ color: 'var(--text-secondary)' }}>{(max - min).toFixed(1)}{cfg.unit}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bar */}
      <div style={{ padding: '0 18px 14px' }}>
        <div style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${avg != null ? Math.min(100, ((avg - cfg.min) / (cfg.max - cfg.min)) * 100) : 0}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease', boxShadow: `0 0 6px ${color}88` }} />
          <div style={{ position: 'absolute', left: `${((cfg.warn - cfg.min) / (cfg.max - cfg.min)) * 100}%`, top: 0, bottom: 0, width: 2, background: 'var(--warn)', opacity: 0.7 }} />
          <div style={{ position: 'absolute', left: `${((cfg.danger - cfg.min) / (cfg.max - cfg.min)) * 100}%`, top: 0, bottom: 0, width: 2, background: 'var(--danger)', opacity: 0.7 }} />
        </div>
      </div>
    </div>
  );
}

// ── Main SensorGrid export ─────────────────────────────────────────────────

export default function SensorGrid({ sensors, loading }) {
  // Group sensors by metric type
  const grouped = useMemo(() => {
    const groups = { temperature: [], humidity: [], ammonia: [] };
    sensors.forEach(s => {
      const type = s.device_type;
      if (type === 'temperature_humidity') {
        groups.temperature.push(s);
        groups.humidity.push(s);
      } else if (type === 'ammonia') {
        groups.ammonia.push(s);
      } else if (type === 'combined') {
        groups.temperature.push(s);
        groups.humidity.push(s);
        groups.ammonia.push(s);
      }
    });
    return groups;
  }, [sensors]);

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {[1,2,3].map(i => <Skeleton key={i} height={260} />)}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {Object.entries(grouped).map(([metric, sensorList], i) => {
        if (sensorList.length === 0) return null;

        if (sensorList.length === 1) {
          const s = sensorList[0];
          const value = s.latest_reading?.[metric];
          return (
            <SensorCard
              key={metric}
              sensor={s}
              metric={metric}
              value={value}
              readings={[]}
              index={i}
            />
          );
        }

        return (
          <MultiSensorCard
            key={metric}
            sensors={sensorList}
            metric={metric}
            index={i}
          />
        );
      })}
    </div>
  );
}
