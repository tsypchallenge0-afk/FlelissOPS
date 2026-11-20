import Skeleton from './Skeleton';
import { sentence } from '../lib/format';

// ── Actuator config ────────────────────────────────────────────────────────

const ACTUATOR_CFG = {
  fans: {
    label: 'Ventilation',
    unit:  '%',
    color: '#20a0e8',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5">
        <path d="M12 12c2.5-2.5 4-6 3-8-1-2-4-2-5 0-1 2 0 5 2 6"/>
        <path d="M12 12c2.5 2.5 6 4 8 3 2-1 2-4 0-5-2-1-5 0-6 2"/>
        <path d="M12 12c-2.5 2.5-4 6-3 8 1 2 4 2 5 0 1-2 0-5-2-6"/>
        <path d="M12 12c-2.5-2.5-6-4-8-3-2 1-2 4 0 5 2 1 5 0 6-2"/>
        <circle cx="12" cy="12" r="2"/>
      </svg>
    ),
    stateKey: 'speed_percent',
    stateLabel: 'Speed',
  },
  heater: {
    label: 'Heating',
    unit:  '°C',
    color: '#e84040',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2v6M12 16v6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M16 12h6M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24"/>
      </svg>
    ),
    stateKey: 'target_temp',
    stateLabel: 'Target',
  },
  feeder: {
    label: 'Feeding',
    unit:  'kg',
    color: '#e8a020',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5">
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>
      </svg>
    ),
    stateKey: 'portion_kg',
    stateLabel: 'Portion',
  },
  lighting: {
    label: 'Lighting',
    unit:  '%',
    color: '#f0e040',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="5"/>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
      </svg>
    ),
    stateKey: 'brightness',
    stateLabel: 'Brightness',
  },
  water: {
    label: 'Watering',
    unit:  '',
    color: '#40c0e8',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>
      </svg>
    ),
    stateKey: 'flow_active',
    stateLabel: 'Flow',
  },
};

// ── Spinning animation for active fans ─────────────────────────────────────

const spinStyle = (active, speed) => ({
  animation: active
    ? `spin ${Math.max(0.5, 2 - speed / 60)}s linear infinite`
    : 'none',
  display: 'inline-block',
});

// ── Single actuator card ───────────────────────────────────────────────────

function ActuatorCard({ actuator, index }) {
  const type  = actuator.device_type?.replace('actuator_', '');
  const cfg   = ACTUATOR_CFG[type];
  if (!cfg) return null;

  const state      = actuator.current_state?.state ?? {};
  const mode       = actuator.current_state?.mode ?? 'auto';
  const updatedBy  = actuator.current_state?.updated_by;
  const updatedAt  = actuator.current_state?.updated_at;
  const isManual   = mode === 'manual';
  const isAI       = updatedBy === 'AI_SYSTEM';

  // Determine if actuator is "active"
  const isActive = (() => {
    if (type === 'fans') {
      const spd = state.speed ?? state.speed_percent ?? 0;
      return spd > 0 && state.running !== false;
    }
    if (type === 'heater')  return state.active === true;
    if (type === 'lighting')return state.on === true;
    if (type === 'water')   return state.flow_active === true;
    if (type === 'feeder')  return false; // feeders are event-based
    return false;
  })();

  const primaryValue = (() => {
    if (type === 'fans') {
      const spd = state.speed ?? state.speed_percent;
      return spd != null ? `${spd}%` : '—';
    }
    if (type === 'heater')  return state.target_temp != null ? `${state.target_temp}°C` : '—';
    if (type === 'lighting')return state.brightness != null ? `${state.brightness}%` : '—';
    if (type === 'feeder')  return state.portion_kg != null ? `${state.portion_kg}kg` : '—';
    if (type === 'water')   return state.flow_active ? 'ON' : 'Off';
    return '—';
  })();

  const secondaryInfo = (() => {
    if (type === 'heater' && state.current_temp != null)
      return `Current ${state.current_temp.toFixed(1)}°C`;
    if (type === 'fans' && state.rpm != null)
      return `${state.rpm} RPM`;
    if (type === 'lighting' && state.on_time && state.off_time)
      return `${state.on_time} → ${state.off_time}`;
    if (type === 'feeder' && state.next_scheduled)
      return `Next: ${new Date(state.next_scheduled).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    return null;
  })();

  const secsAgo = updatedAt
    ? Math.round((Date.now() - new Date(updatedAt)) / 1000)
    : null;

  return (
    <div
      className="panel fade-in"
      style={{
        animationDelay: `${index * 0.05}s`,
        padding: '18px',
        borderColor: isManual ? 'var(--warn)'
          : isActive ? cfg.color + '80'
          : 'var(--border-dim)',
        boxShadow: isActive
          ? `0 0 20px ${cfg.color}22`
          : 'none',
        transition: 'all 0.3s ease',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Icon — spins when fan is active */}
          <div style={{
            width: 44, height: 44,
            border: `1.5px solid ${isActive ? cfg.color : 'var(--border-dim)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isActive ? cfg.color : 'var(--text-dim)',
            transition: 'all 0.3s ease',
            boxShadow: isActive ? `0 0 12px ${cfg.color}44` : 'none',
          }}>
            <span style={type === 'fans' ? spinStyle(isActive, state.speed ?? state.speed_percent ?? 0) : {}}>
              {cfg.icon}
            </span>
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 14,
              fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-primary)',
            }}>
              {cfg.label}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--text-dim)',
            }}>
              {actuator.device_id}
            </div>
          </div>
        </div>

        {/* Mode badge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            letterSpacing: '0.08em',
            color: isManual ? 'var(--warn)' : isAI ? 'var(--ok)' : 'var(--info)',
            background: isManual ? 'var(--warn-glow)' : isAI ? 'var(--ok-glow)' : 'var(--info-glow)',
            border: `1px solid ${isManual ? 'rgba(192,112,16,0.3)' : isAI ? 'rgba(31,189,110,0.3)' : 'rgba(32,160,232,0.3)'}`,
            padding: '3px 8px', borderRadius: 'var(--radius)',
          }}>
            {isManual ? 'Manual' : isAI ? 'AI managed' : 'Auto'}
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: isActive ? cfg.color : 'var(--text-dim)',
            letterSpacing: '0.06em',
          }}>
            {isActive ? '● ACTIVE' : '○ IDLE'}
          </span>
        </div>
      </div>

      {/* Primary value — large display */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 6,
        marginBottom: secondaryInfo ? 6 : 12,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 42,
          color: isActive ? cfg.color : 'var(--text-secondary)',
          lineHeight: 1,
          transition: 'color 0.3s ease',
        }}>
          {primaryValue}
        </span>
      </div>

      {/* Secondary info */}
      {secondaryInfo && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 12,
          color: 'var(--text-secondary)', marginBottom: 12,
        }}>
          {secondaryInfo}
        </div>
      )}

      {/* Progress bar for percentage-based actuators */}
      {(type === 'fans' || type === 'lighting') && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 3 }}>
            <div style={{
              height: '100%',
              width: `${type === 'fans' ? (state.speed ?? state.speed_percent ?? 0) : (state.brightness ?? 0)}%`,
              background: isActive ? cfg.color : 'var(--text-dim)',
              borderRadius: 3,
              transition: 'width 0.5s ease, background 0.3s ease',
              boxShadow: isActive ? `0 0 6px ${cfg.color}` : 'none',
            }} />
          </div>
        </div>
      )}

      {/* Heater target vs current bar */}
      {type === 'heater' && state.target_temp && state.current_temp != null && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
              CURRENT {state.current_temp?.toFixed(1)}°C
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: cfg.color }}>
              TARGET {state.target_temp}°C
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 3, position: 'relative' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, ((state.current_temp - 15) / (state.target_temp + 5 - 15)) * 100)}%`,
              background: cfg.color, borderRadius: 3, transition: 'width 0.5s ease',
            }} />
            <div style={{
              position: 'absolute',
              left: `${Math.min(98, ((state.target_temp - 15) / (state.target_temp + 5 - 15)) * 100)}%`,
              top: -2, bottom: -2, width: 2,
              background: cfg.color, opacity: 0.6,
            }} />
          </div>
        </div>
      )}

      {/* Footer — last updated */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 10, borderTop: '1px solid var(--border-dim)',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--text-dim)',
        }}>
          {updatedBy ? `By ${updatedBy === 'AI_SYSTEM' ? 'AI' : sentence(updatedBy)}` : 'No commands yet'}
        </span>
        {secsAgo != null && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: secsAgo < 120 ? 'var(--ok)' : secsAgo < 600 ? 'var(--warn)' : 'var(--danger)',
          }}>
            {secsAgo < 60 ? `${secsAgo}s ago` : secsAgo < 3600 ? `${Math.round(secsAgo/60)}m ago` : `${Math.round(secsAgo/3600)}h ago`}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main ActuatorGrid export ───────────────────────────────────────────────

export default function ActuatorGrid({ actuators, loading }) {
  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[1,2,3,4,5].map(i => <Skeleton key={i} height={220} />)}
      </div>
    );
  }

  if (!actuators.length) return null;

  return (
    <>
      {/* Add spinning fan CSS */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {actuators.map((act, i) => (
          <ActuatorCard key={act._id ?? act.device_id ?? i} actuator={act} index={i} />
        ))}
      </div>
    </>
  );
}
