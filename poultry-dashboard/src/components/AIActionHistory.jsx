import React, { useState, useMemo } from 'react';
import { useAIActions } from '../hooks/useAIActions';
import Skeleton from './Skeleton';
import { sentence } from '../lib/format';

const DEVICE_MAP = {
  fan: { label: 'Fans', color: 'var(--info)' },
  heater: { label: 'Heater', color: 'var(--danger)' },
  feeder: { label: 'Feeder', color: 'var(--ok)' },
  lighting: { label: 'Lights', color: 'var(--accent)' },
};

export default function AIActionHistory({ houseId }) {
  const { actions, loading } = useAIActions(houseId);
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    return filter === 'all' ? actions : actions.filter(a => a.device_type === filter);
  }, [actions, filter]);

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="mono" style={{ fontSize: '12px', margin: 0, letterSpacing: '0.1em' }}>AI decision archive</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['all', 'fan', 'heater', 'feeder'].map(f => (
            <button 
              key={f}
              onClick={() => setFilter(f)}
              className="mono"
              style={{
                fontSize: '9px',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border-dim)',
                background: filter === f ? 'var(--info)' : 'transparent',
                color: filter === f ? '#fff' : 'var(--text-dim)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {sentence(f)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[1, 2, 3, 4].map(i => <Skeleton key={i} height={50} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }} className="mono">No records found</div>
        ) : (
          filtered.map((action, i) => {
            const dev = DEVICE_MAP[action.device_type] || { label: sentence(action.device_type), color: 'var(--text-secondary)' };
            const time = new Date(action.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            const date = new Date(action.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            
            return (
              <div key={i} style={{ 
                padding: '12px 16px', 
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                transition: 'background 0.2s'
              }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                <div className="mono" style={{ minWidth: '70px', fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.2 }}>
                  {time}<br/><span style={{ opacity: 0.5 }}>{date}</span>
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
                    <span className="mono" style={{ fontSize: '11px', fontWeight: 700, color: dev.color }}>{dev.label}</span>
                    <span className="mono" style={{ fontSize: '10px', color: 'var(--text-primary)' }}>→ {sentence(action.command?.replace(/_/g, ' '))}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-dim)', opacity: 0.8 }}>{action.reason}</div>
                </div>

                <div className="mono" style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{sentence(action.confidence)} confidence</div>
                  <div style={{ fontSize: '8px', color: 'var(--text-dim)', marginTop: '2px' }}>Tier {action.tier || 1}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
