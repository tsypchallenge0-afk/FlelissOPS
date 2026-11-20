import React from 'react';

const RadialGauge = ({ 
  value, 
  prevValue,
  min = 0, 
  max = 100, 
  dailyMin,
  dailyMax,
  label, 
  unit, 
  color = 'var(--accent)', 
  glowColor = 'var(--accent-glow)',
  thresholds = { warn: 70, danger: 90 } 
}) => {
  const radius = 42;
  const stroke = 6;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  
  const rawProgress = (value - min) / (max - min);
  const progress = isNaN(rawProgress) ? 0 : Math.min(Math.max(rawProgress, 0), 1);
  const strokeDashoffset = isNaN(progress) ? circumference : circumference - progress * circumference;

  const getMarkerPos = (val) => {
    const p = Math.min(Math.max((val - min) / (max - min), 0), 1);
    const angle = p * 360 - 90;
    const x = 50 + radius * Math.cos((angle * Math.PI) / 180);
    const y = 50 + radius * Math.sin((angle * Math.PI) / 180);
    return { x, y };
  };

  const warnPos = getMarkerPos(thresholds.warn);
  const dangerPos = getMarkerPos(thresholds.danger);

  const noData = value == null || Number.isNaN(value);
  const isWarning = !noData && value >= thresholds.warn && value < thresholds.danger;
  const isDanger = !noData && value >= thresholds.danger;
  const currentColor = noData ? 'var(--text-dim)' : isDanger ? 'var(--danger)' : isWarning ? 'var(--warn)' : color;
  const currentGlow = isDanger ? 'var(--danger-glow)' : isWarning ? 'var(--warn-glow)' : glowColor;

  const trend = noData || prevValue == null ? 'stable' : value > prevValue ? 'up' : value < prevValue ? 'down' : 'stable';
  const statusLabel = noData ? 'No data' : isDanger ? 'Critical' : isWarning ? 'Warning' : 'Optimal';
  // Label colour follows the status (the arc keeps the metric's accent colour when optimal)
  const statusColor = noData ? 'var(--text-dim)' : isDanger ? 'var(--danger)' : isWarning ? 'var(--warn)' : 'var(--ok)';

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      padding: '20px 16px',
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-dim)',
      borderRadius: 'var(--radius)',
      position: 'relative',
      minWidth: '180px',
      transition: 'all 0.3s ease'
    }}>
      {/* Top Info Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '12px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
        <span className="mono" style={{ 
          fontSize: '12px',
          color: statusColor,
          fontWeight: 700,
          letterSpacing: '0.05em',
          border: `1px solid ${statusColor}`,
          padding: '2px 10px',
          borderRadius: '999px'
        }}>{statusLabel}</span>
      </div>

      <div style={{ position: 'relative', width: '110px', height: '110px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={stroke}
          />
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={currentColor}
            strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`}
            style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.8s ease-in-out', filter: `drop-shadow(0 0 5px ${currentGlow})` }}
            strokeLinecap="round"
          />
        </svg>

        {/* Breach Markers */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
           <div style={{ position: 'absolute', left: `${warnPos.x}%`, top: `${warnPos.y}%`, width: '5px', height: '5px', background: 'var(--warn)', borderRadius: '50%', transform: 'translate(-50%, -50%)', boxShadow: '0 0 8px var(--warn)' }} />
           <div style={{ position: 'absolute', left: `${dangerPos.x}%`, top: `${dangerPos.y}%`, width: '5px', height: '5px', background: 'var(--danger)', borderRadius: '50%', transform: 'translate(-50%, -50%)', boxShadow: '0 0 8px var(--danger)' }} />
        </div>

        {/* Center Readout */}
        <div style={{ position: 'absolute', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <span className="mono" style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {noData ? '—' : value.toFixed(1)}
            </span>
            {trend !== 'stable' && (
              <span style={{ 
                fontSize: '12px', 
                color: trend === 'up' ? 'var(--danger)' : 'var(--info)',
                transform: trend === 'down' ? 'rotate(180deg)' : 'none',
                transition: 'all 0.3s'
              }}>▲</span>
            )}
          </div>
          <div className="mono" style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>
            {unit}
          </div>
        </div>
      </div>

      {/* Bottom Range Strip */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        width: '100%', 
        marginTop: '16px',
        paddingTop: '12px',
        borderTop: '1px solid rgba(255,255,255,0.05)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Min (last hour)</span>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{dailyMin == null ? '—' : dailyMin.toFixed(1)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Max (last hour)</span>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{dailyMax == null ? '—' : dailyMax.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
};

export default RadialGauge;
