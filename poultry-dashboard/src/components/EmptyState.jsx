import React from 'react';

const ICONS = {
  check: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  search: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  warning: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  device: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="6" width="20" height="12" rx="2"/>
      <path d="M2 10h20"/><circle cx="12" cy="15" r="1.5"/>
    </svg>
  ),
  data: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
};

export default function EmptyState({ icon = 'search', title, subtitle, action, color = 'var(--text-dim)' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', gap: 12, color,
    }}>
      <div style={{
        width: 48, height: 48,
        border: `1px solid ${color}`,
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: 0.6,
      }}>
        {ICONS[icon]}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 13,
        fontWeight: 600, letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>
        {title}
      </div>
      {subtitle && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--text-dim)', textAlign: 'center',
          maxWidth: 240, lineHeight: 1.6,
        }}>
          {subtitle}
        </div>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 4, padding: '6px 14px',
            fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            border: '1px solid var(--border-mid)',
            backgroundColor: 'transparent', color: 'var(--text-secondary)',
            cursor: 'pointer', borderRadius: 'var(--radius)',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
