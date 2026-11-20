import { usePredictions } from '../hooks/usePredictions';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';
import { sentence } from '../lib/format';

const METRIC_CFG = {
  temperature: { label: 'Temp', unit: '°C',  color: '#e84040' },
  humidity:    { label: 'Hum',  unit: '%RH', color: '#20a0e8' },
  ammonia:     { label: 'NH₃',  unit: 'ppm', color: '#e8a020' },
};

const RISK_COLORS = {
  CRITICAL: 'var(--danger)',
  HIGH:     'var(--danger)',
  MEDIUM:   'var(--warn)',
  LOW:      'var(--warn)',
  NORMAL:   'var(--ok)',
};

const RISK_BADGE_CLASS = {
  CRITICAL: 'danger',
  HIGH:     'danger',
  MEDIUM:   'warn',
  LOW:      'warn',
  NORMAL:   'ok',
};

export default function PredictionPanel({ houseId }) {
  const {
    predictions, anomalies, coverage,
    loading, error, refresh, wsActive,
  } = usePredictions(houseId);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-header">
          <span className="panel-title">◈ AI PREDICTIONS</span>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Skeleton width={36}  height={12} />
              <Skeleton width={64}  height={12} />
              <Skeleton width={120} height={22} radius={3} />
              <Skeleton width={48}  height={10} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error / unavailable state ──────────────────────────────────────────────
  if (error || !predictions) {
    return (
      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-header">
          <span className="panel-title">◈ AI PREDICTIONS</span>
        </div>
        <EmptyState
          icon="data"
          title="Predictions unavailable"
          subtitle={
            coverage?.days < 7
              ? `Need ${7 - Math.floor(coverage?.days ?? 0)} more days of data`
              : 'AI engine not responding'
          }
          action={{ label: 'Retry', onClick: refresh }}
        />
      </div>
    );
  }

  const riskLevel = predictions.risk_level ?? 'NORMAL';
  const tiers     = predictions.active_tiers ?? {};
  const days      = coverage?.days ?? predictions.data_coverage?.days ?? 0;

  return (
    <div className="panel fade-in" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div className="panel-header">
        <span className="panel-title">
          <span style={{ color: 'var(--accent)' }}>◈</span> AI predictions
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Active tier badges */}
          {tiers.anomaly  && <TierBadge label="Anomaly" />}
          {tiers.prophet  && <TierBadge label="Prophet" />}
          {tiers.trend    && <TierBadge label="Trend" />}
          {/* WS live indicator */}
          {wsActive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: 'var(--ok)',
                animation: 'pulse-dot 1.5s infinite',
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--ok)', letterSpacing: '0.08em',
              }}>Live</span>
            </div>
          )}
          {/* Risk badge */}
          <span className={`status-badge ${RISK_BADGE_CLASS[riskLevel] ?? 'ok'}`}>
            RISK: {riskLevel}
          </span>
        </div>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Per-metric rows */}
        {Object.entries(METRIC_CFG).map(([key, cfg], i) => {
          const pred = predictions.predictions?.[key];
          return (
            <MetricRow
              key={key}
              label={cfg.label}
              unit={cfg.unit}
              color={cfg.color}
              pred={pred}
              isLast={i === Object.keys(METRIC_CFG).length - 1}
            />
          );
        })}

        {/* Anomalies section */}
        {anomalies.length > 0 && (
          <div style={{
            borderTop: '1px solid var(--border-dim)',
            paddingTop: 12, marginTop: 12,
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-dim)', letterSpacing: '0.15em',
              marginBottom: 8, textTransform: 'uppercase',
            }}>
              // Anomalies detected
            </div>
            {anomalies.slice(0, 3).map((a, i) => (
              <AnomalyRow key={i} anomaly={a} />
            ))}
            {anomalies.length > 3 && (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                color: 'var(--text-dim)', textAlign: 'center',
                paddingTop: 6,
              }}>
                +{anomalies.length - 3} more anomalies detected
              </div>
            )}
          </div>
        )}

        {/* Footer — data coverage + timestamp */}
        <div style={{
          borderTop: '1px solid var(--border-dim)',
          paddingTop: 10, marginTop: 12,
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--text-dim)',
            }}>
              {days.toFixed(1)} days · {(coverage?.count ?? 0).toLocaleString()} readings
            </span>
            {/* Data threshold progress */}
            <div style={{ display: 'flex', gap: 8 }}>
              <DataThresholdPip days={days} threshold={7}  label="Anomaly" />
              <DataThresholdPip days={days} threshold={14} label="Prophet" />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-dim)',
            }}>
              Updated {new Date(predictions.generated_at).toLocaleTimeString('en-GB')}
            </span>
            <button
              onClick={refresh}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--text-dim)', background: 'transparent',
                border: 'none', cursor: 'pointer', letterSpacing: '0.08em',
                padding: 0, textDecoration: 'underline',
              }}
            >
              Refresh
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MetricRow({ label, unit, color, pred, isLast }) {
  const available      = pred?.available ?? false;
  const rate           = pred?.rate_per_minute ?? pred?.tier1_context?.rate_per_minute ?? null;
  const confidence     = pred?.confidence ?? pred?.tier1_context?.confidence ?? null;
  const tier           = pred?.tier ?? null;
  const willDanger     = pred?.will_breach_danger ?? false;
  const willWarn       = pred?.will_breach_warn ?? false;
  const minsToDanger   = pred?.minutes_to_danger ?? null;
  const minsToWarn     = pred?.minutes_to_warn ?? null;
  const currentValue   = pred?.current_value ?? null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      gap: 10, paddingBottom: isLast ? 0 : 10,
      marginBottom: isLast ? 0 : 10,
      borderBottom: isLast ? 'none' : '1px solid var(--border-dim)',
      opacity: available ? 1 : 0.4,
    }}>
      {/* Metric label */}
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 12,
        color, width: 34, flexShrink: 0, fontWeight: 600,
      }}>
        {label}
      </span>

      {/* Current value */}
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color: 'var(--text-secondary)', width: 52, flexShrink: 0,
      }}>
        {currentValue != null ? `${currentValue.toFixed(1)}${unit}` : '—'}
      </span>

      {/* Rate of change */}
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        width: 68, flexShrink: 0,
        color: rate == null ? 'var(--text-dim)'
             : rate > 0 ? 'var(--danger)'
             : rate < 0 ? 'var(--info)'
             : 'var(--text-dim)',
      }}>
        {rate != null
          ? `${rate > 0 ? '+' : ''}${rate.toFixed(2)}/m`
          : '—'}
      </span>

      {/* Breach prediction */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!available ? (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--text-dim)',
          }}>
            Insufficient data
          </span>
        ) : willDanger && minsToDanger != null ? (
          <span style={{
            display: 'inline-block',
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--danger)',
            background: 'var(--danger-glow)',
            border: '1px solid rgba(232,58,32,0.3)',
            padding: '3px 8px',
            borderRadius: 'var(--radius)',
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
          }}>
            DANGER {minsToDanger}min
          </span>
        ) : willWarn && minsToWarn != null ? (
          <span style={{
            display: 'inline-block',
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--warn)',
            background: 'var(--warn-glow)',
            border: '1px solid rgba(192,112,16,0.3)',
            padding: '3px 8px',
            borderRadius: 'var(--radius)',
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
          }}>
            WARN {minsToWarn}min
          </span>
        ) : (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--ok)',
          }}>
            Within limits
          </span>
        )}
      </div>

      {/* Tier + confidence */}
      {tier != null && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--text-dim)', letterSpacing: '0.06em',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          T{tier}{confidence ? ` · ${sentence(confidence).slice(0, 3)}` : ''}
        </span>
      )}
    </div>
  );
}

function AnomalyRow({ anomaly }) {
  const isCritical = anomaly.severity === 'critical';
  const borderColor = isCritical ? 'rgba(232,58,32,0.3)' : 'rgba(192,112,16,0.3)';
  const textColor   = isCritical ? 'var(--danger)' : 'var(--warn)';
  const bgColor     = isCritical ? 'var(--danger-glow)' : 'var(--warn-glow)';

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderLeft: `3px solid ${textColor}`,
      padding: '8px 10px',
      marginBottom: 6,
      borderRadius: 0,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 4,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: textColor, letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          {anomaly.severity} anomaly
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--text-dim)',
        }}>
          {new Date(anomaly.timestamp).toLocaleTimeString('en-GB')}
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color: 'var(--text-secondary)',
        display: 'flex', gap: 10,
      }}>
        <span>T:{anomaly.temperature}°C</span>
        <span>H:{anomaly.humidity}%</span>
        <span>NH₃:{anomaly.ammonia}ppm</span>
        <span style={{ color: 'var(--text-dim)', marginLeft: 'auto' }}>
          score:{anomaly.anomaly_score?.toFixed(3)}
        </span>
      </div>
    </div>
  );
}

function TierBadge({ label }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 9,
      color: 'var(--info)',
      background: 'var(--info-glow)',
      border: '1px solid rgba(32,160,232,0.25)',
      padding: '2px 6px',
      borderRadius: 'var(--radius)',
      letterSpacing: '0.08em',
    }}>
      {label}
    </span>
  );
}

function DataThresholdPip({ days, threshold, label }) {
  const reached = days >= threshold;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: reached ? 'var(--ok)' : 'var(--text-dim)',
        flexShrink: 0,
      }} />
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9,
        color: reached ? 'var(--ok)' : 'var(--text-dim)',
        letterSpacing: '0.06em',
      }}>
        {label} {reached ? 'ON' : `${Math.max(0, threshold - Math.floor(days))}d`}
      </span>
    </div>
  );
}
