import { useState, useEffect } from 'react';
import { api } from '../lib/Api';
import SetpointCurveEditor from './SetpointCurveEditor';
import Skeleton from './Skeleton';
import { useRole } from '../context/AuthContext';
import { Wind, Wheat } from 'lucide-react';

export default function FlockCurvePanel({ flock, kpis }) {
  const [curves,         setCurves]         = useState([]);
  const [todaySetpoints, setTodaySetpoints] = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [activeTab,      setActiveTab]      = useState('environmental');
  const role = useRole();
  const canEdit = role === 'supervisor' || role === 'admin';

  const flockId = flock?._id ?? flock?.id;
  const ageDay  = kpis?.age_days ?? 0;

  useEffect(() => {
    if (!flockId) return;
    Promise.all([
      api.getFlockCurves(flockId),
      api.getTodaysSetpoints(flockId),
    ])
      .then(([c, s]) => {
        setCurves(c);
        setTodaySetpoints(s?.setpoints);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [flockId]);

  const getCurve = (type) => curves.find(c => c.curve_type === type);

  return (
    <div className="panel fade-in" style={{ padding: 0, marginTop: 16 }}>
      {/* Header */}
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <span className="panel-title">
          <span className="panel-title-accent">◈</span> Courbes de consignes
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Today's setpoints summary */}
          {todaySetpoints?.environmental && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginRight: 16 }}>
              {[
                { label: 'T°', value: todaySetpoints.environmental.temperature_c, unit: '°C', color: 'var(--danger)' },
                { label: 'H',  value: todaySetpoints.environmental.humidity_pct,  unit: '%',  color: 'var(--info)' },
                { label: 'CO₂',value: todaySetpoints.environmental.co2_ppm,       unit: 'ppm',color: 'var(--text-dim)' },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>{s.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: s.color }}>{s.value?.toFixed(1)}{s.unit}</span>
                </div>
              ))}
            </div>
          )}
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--ok)', background: 'var(--ok-glow)',
            border: '1px solid rgba(31,189,110,0.3)',
            padding: '3px 8px', borderRadius: 'var(--radius)',
            letterSpacing: '0.06em',
          }}>
            DAY {ageDay} — CURVES ACTIVE
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-dim)' }}>
        {[
          { key: 'environmental', label: 'Environment',  color: 'var(--info)', icon: Wind },
          { key: 'nutritional',   label: 'Nutrition',    color: 'var(--ok)',   icon: Wheat },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: '10px 16px',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              border: 'none',
              borderBottom: `2px solid ${activeTab === tab.key ? tab.color : 'transparent'}`,
              background: activeTab === tab.key ? `${tab.color}11` : 'transparent',
              color: activeTab === tab.key ? tab.color : 'var(--text-dim)',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Curve editor */}
      <div>
        {loading ? (
          <div style={{ padding: 20 }}>
            <Skeleton height={300} />
          </div>
        ) : (
          <SetpointCurveEditor
            flockId={flockId}
            ageDay={ageDay}
            curveType={activeTab}
            initialCurve={getCurve(activeTab)}
            todaySetpoints={todaySetpoints?.[activeTab]}
            readOnly={!canEdit}
            onSave={(updated) => {
              setCurves(prev => prev.map(c =>
                c.curve_type === activeTab ? { ...c, checkpoints: updated } : c
              ));
            }}
          />
        )}
      </div>

      {/* Info note */}
      {!canEdit && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-dim)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
          Supervisor or admin required to edit curves
        </div>
      )}
    </div>
  );
}
