import React, { useMemo } from 'react';
import { useAIActions } from '../hooks/useAIActions';
import EmptyState from './EmptyState';
import Skeleton from './Skeleton';
import { sentence } from '../lib/format';

const TRIGGER_COLORS = {
  temperature_breach: '#e84040',
  temperature_low:    '#20a0e8',
  ammonia_breach:     '#e8a020',
  humidity_breach:    '#20a0e8',
};

const DEVICE_LABELS = {
  fans:    'Fans',
  fan:     'Fans',
  heater:  'Heater',
  feeder:  'Feeder',
  lighting:'Lights',
};

export default function AIActionLog({ houseId, activeAlerts = [] }) {
  const { actions, loading } = useAIActions(houseId);

  // Filter for 'Live' actions:
  // 1. Must be the latest action for that device type
  // 2. Must correspond to a metric that currently has an active alert
  const liveActions = useMemo(() => {
    if (!actions.length) return [];
    
    // Get latest action per device
    const latestPerDevice = {};
    actions.forEach(a => {
      if (!latestPerDevice[a.device_type]) {
        latestPerDevice[a.device_type] = a;
      }
    });

    const activeMetrics = new Set(activeAlerts.map(al => al.metric));
    
    return Object.values(latestPerDevice).filter(action => {
        // Keep it if it's an intervention (not a deactivation) 
        // AND there is an active alert for that metric
        const isIntervention = action.payload?.running !== false && (action.payload?.speed_percent > 0 || action.payload?.active !== false);
        return isIntervention && activeMetrics.has(action.metric);
    });
  }, [actions, activeAlerts]);

  return (
    <div className="panel" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '140px' }}>
      <div className="panel-header">
        <span className="panel-title">
          <span style={{ color: 'var(--ok)' }}>◈</span> Live AI interventions
        </span>
        {liveActions.length > 0 && (
          <span className="pulse-dot" style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--danger)', background: 'var(--danger-glow)',
            border: '1px solid rgba(232,58,32,0.3)',
            padding: '2px 6px', borderRadius: '4px',
          }}>
            {liveActions.length} active
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
            <Skeleton height={56} />
          </div>
        ) : liveActions.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>
             <span className="mono dim" style={{ fontSize: '10px' }}>No active AI interventions</span>
          </div>
        ) : (
          liveActions.map((action, i) => (
            <AIActionCard key={i} action={action} index={i} />
          ))
        )}
      </div>
    </div>
  );
}

function AIActionCard({ action, index }) {
  const triggerColor = TRIGGER_COLORS[action.triggered_by] ?? 'var(--accent)';
  const deviceLabel  = DEVICE_LABELS[action.device_type] ?? sentence(action.device_type);

  return (
    <div
      className="fade-in"
      style={{
        animationDelay: `${index * 0.04}s`,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-dim)',
        borderLeft: `3px solid ${triggerColor}`,
        padding: '9px 12px',
        marginBottom: 6,
        borderRadius: 0,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* AI badge */}
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color: 'var(--ok)', background: 'var(--ok-glow)',
            border: '1px solid rgba(31,189,110,0.3)',
            padding: '2px 5px', borderRadius: 'var(--radius)',
            letterSpacing: '0.08em',
          }}>
            AI
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: triggerColor, letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            {deviceLabel}
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--text-dim)',
          }}>
            T{action.tier || 1} · {sentence((action.confidence || 'MEDIUM'))}
          </span>
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--text-dim)',
        }}>
          {new Date(action.timestamp || 0).toLocaleTimeString('en-GB')}
        </span>
      </div>

      {/* Command issued */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color: 'var(--text-secondary)', marginBottom: 4,
      }}>
        {Object.entries(action.payload ?? {}).map(([k, v]) => (
          <span key={k} style={{ marginRight: 10 }}>
            {k.replace(/_/g, ' ')}: <span style={{ color: 'var(--text-primary)' }}>{String(v)}</span>
          </span>
        ))}
      </div>

      {/* Reason */}
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 11,
        color: 'var(--text-dim)', lineHeight: 1.5,
      }}>
        {action.reason}
      </div>

      {/* Metric context */}
      {action.metric_value != null && (
        <div style={{
          marginTop: 5,
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--text-dim)',
        }}>
          {sentence(action.metric)} = {action.metric_value?.toFixed(1)}
          {action.minutes_to_breach != null && (
            <span style={{ color: triggerColor, marginLeft: 8 }}>
              breach predicted in {action.minutes_to_breach?.toFixed(0)}min
            </span>
          )}
        </div>
      )}
    </div>
  );
}
