import React from 'react';

export default function Skeleton({ width = '100%', height = 20, radius = 4, style = {} }) {
  return (
    <div style={{
      width, height,
      borderRadius: radius,
      backgroundColor: 'var(--bg-surface)',
      position: 'relative',
      overflow: 'hidden',
      ...style,
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(
          90deg,
          transparent 0%,
          var(--bg-hover) 50%,
          transparent 100%
        )`,
        animation: 'skeleton-sweep 1.4s ease infinite',
      }} />
      <style>{`
        @keyframes skeleton-sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
