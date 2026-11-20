import React from 'react';
import { sentence } from '../lib/format';

const POSITION_ZONES = [
  'Front-Left', 'Front-Center', 'Front-Right',
  'Middle-Left', 'Middle-Center', 'Middle-Right',
  'Back-Left', 'Back-Center', 'Back-Right'
];

export default function PositionSelector({ value, onChange, error }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: error ? 'var(--danger)' : 'var(--text-dim)',
        marginBottom: 8,
      }}>
        Installation Position{error && <span style={{ marginLeft: 6, fontWeight: 400 }}>— {error}</span>}
      </label>
      
      <div style={{
        position: 'relative',
        width: '100%',
        height: '180px',
        backgroundColor: 'var(--bg-surface)',
        border: `1px solid ${error ? 'var(--danger)' : 'var(--border-mid)'}`,
        borderRadius: 'var(--radius)',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        gap: '4px',
        padding: '8px',
        boxSizing: 'border-box'
      }}>
         {POSITION_ZONES.map(zone => (
           <div
             key={zone}
             onClick={() => onChange(zone)}
             style={{
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'center',
               flexDirection: 'column',
               backgroundColor: value === zone ? 'var(--accent)' : 'var(--bg-panel)',
               color: value === zone ? '#1a1a1a' : 'var(--text-secondary)',
               borderRadius: '4px',
               cursor: 'pointer',
               fontFamily: 'var(--font-mono)',
               fontSize: '10px',
               fontWeight: value === zone ? 'bold' : 'normal',
               transition: 'all 0.15s',
               border: value === zone ? 'none' : '1px solid var(--border-dim)'
             }}
           >
             <span>{sentence(zone.split('-')[0])}</span>
             <span style={{ opacity: 0.6 }}>{sentence(zone.split('-')[1])}</span>
           </div>
         ))}
      </div>
    </div>
  );
}
