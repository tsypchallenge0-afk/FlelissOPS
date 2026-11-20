import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
  ReferenceDot
} from 'recharts';
import './TelemetryChart.css';
import { sentence } from '../lib/format';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="mono" style={{ marginBottom: 8, fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="tooltip-row">
          <span style={{ color: p.color, fontSize: 11 }} className="mono">{sentence(p.name)}</span>
          <span className="mono" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{p.value?.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
};

export default function TelemetryChart({ data, metrics, anomalies = [] }) {
  const [filter, setFilter] = useState('ALL');

  const lines = filter === 'ALL'
    ? metrics
    : metrics.filter(m => m.label.includes(filter) || (filter === 'NH₃' && m.key === 'ammonia'));

  const hasForecastFor = (key) => Array.isArray(data) && data.some(d => d?.[`${key}_forecast`] != null);

  return (
    <div className="telemetry-chart-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, minHeight: 0 }}>
      <div className="chart-controls">
        <div className="filter-buttons">
          {['ALL', 'Temp', 'Hum', 'NH₃'].map(f => (
            <button
              key={f}
              className={`filter-btn mono ${filter === f ? 'active' : ''} ${filter === f && f !== 'ALL' ? f.toLowerCase() : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-area" style={{ flex: 1, minHeight: '300px', minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%" minHeight={100} minWidth={100}>
          <LineChart data={data} margin={{ top: 16, right: 30, bottom: 20, left: -10 }}>
            <CartesianGrid strokeDasharray="3 6" stroke="var(--border-dim)" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontFamily: 'var(--font-body)', fontSize: 10, fill: 'var(--text-dim)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border-mid)' }}
              dy={10}
              minTickGap={30}
            />
            <YAxis
              tick={{ fontFamily: 'var(--font-body)', fontSize: 10, fill: 'var(--text-dim)' }}
              tickLine={false}
              axisLine={false}
              dx={-10}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border-mid)', strokeWidth: 1, strokeDasharray: '4 4' }} />

            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-body)', color: 'var(--text-secondary)', bottom: -5 }}
              formatter={(value) => (
                <span style={{ color: 'var(--text-secondary)', marginLeft: 4 }}>
                  {sentence(value)} [{metrics.find(m => m.key === value)?.unit}]
                </span>
              )}
            />

            {lines.map(m => (
              <ReferenceLine
                key={`ref-${m.key}`}
                y={m.dangerThreshold}
                stroke={m.color}
                strokeDasharray="4 4"
                strokeOpacity={0.4}
              />
            ))}

            {lines.map(m => (
              <Line
                key={m.key}
                type="monotone"
                dataKey={m.key}
                stroke={m.color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                name={m.key}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}

            {/* Dashed forecast overlay (hidden from Legend; relies on `${metricKey}_forecast` data keys) */}
            {lines.map(m => (
              hasForecastFor(m.key) && (
                <Line
                  key={`${m.key}-forecast`}
                  type="monotone"
                  dataKey={`${m.key}_forecast`}
                  stroke={m.color}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={false}
                  opacity={0.55}
                  isAnimationActive={false}
                  connectNulls={false}
                  legendType="none"
                  activeDot={{ r: 3, strokeWidth: 0 }}
                  name={`${m.key} forecast`}
                />
              )
            ))}

            {/* ── Anomaly dots ── */}
            {anomalies.map((a, i) => {
              const timeLabel = new Date(a.timestamp).toLocaleTimeString();
              // Only render if this timestamp exists in chart data
              const exists = data.some(d => d.time === timeLabel);
              if (!exists) return null;

              return (
                <ReferenceDot
                  key={`anomaly-${i}`}
                  x={timeLabel}
                  y={a.temperature}
                  r={5}
                  fill="var(--danger)"
                  stroke="var(--bg-panel)"
                  strokeWidth={2}
                  label={null}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}