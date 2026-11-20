import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useWSSubscribe } from '../context/WSContext';
import { api } from '../lib/Api';
import { toast } from 'sonner';

// ── Projection (cutaway dimetric) ─────────────────────────────────────────
// x = along the house length (Front → Back), z = across the width (Left → Right), y = height.
// The long axis is kept shallow so the house fills a wide panel.
const XV = [0.96, 0.28];    // screen direction of +x
const ZV = [-0.6, 0.42];    // screen direction of +z (towards the viewer)

const SCALE = 1.8;
const L = 200 * SCALE;   // house length
const W = 60 * SCALE;    // house width
const H = 20 * SCALE;    // far wall height (near walls are cut low)
const CUT = 0.3;         // near wall height as a fraction of H

function P(x, y, z) {
  return { x: x * XV[0] + z * ZV[0], y: x * XV[1] + z * ZV[1] - y };
}
const pts = (...ps) => ps.map(p => `${p.x},${p.y}`).join(' ');

// Drawing bounds → viewBox (includes silo on the left and pin labels on top)
const VB = (() => {
  const c = [[0, 0, 0], [L, 0, 0], [0, 0, W], [L, 0, W], [0, H, 0], [L, H, 0]].map(([x, y, z]) => P(x, y, z));
  const minX = Math.min(...c.map(p => p.x)) - 70, maxX = Math.max(...c.map(p => p.x)) + 24;
  const siloTop = P(-38, 0, W * 0.2).y - 96;
  const minY = Math.min(Math.min(...c.map(p => p.y)) - 34, siloTop), maxY = Math.max(...c.map(p => p.y)) + 26;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
})();

// Screen (SVG) point on the floor → normalized house coordinates.
const DET = XV[0] * ZV[1] - ZV[0] * XV[1];
function screenToNorm(sx, sy) {
  const x = (sx * ZV[1] - sy * ZV[0]) / DET;
  const z = (sy * XV[0] - sx * XV[1]) / DET;
  const clamp = v => Math.min(0.97, Math.max(0.03, v));
  return { nx: clamp(x / L), nz: clamp(z / W) };
}

// ── Positions (match RegistrationDrawer's installation positions) ─────────
const ROWS = { Front: 1 / 6, Middle: 0.5, Back: 5 / 6 };
const COLS = { Left: 1 / 6, Center: 0.5, Right: 5 / 6 };

function positionToNorm(position) {
  const [row, col] = String(position || '').split('-');
  if (ROWS[row] == null || COLS[col] == null) return null;
  return { nx: ROWS[row], nz: COLS[col] };
}

function normToPosition(nx, nz) {
  const row = nx < 1 / 3 ? 'Front' : nx < 2 / 3 ? 'Middle' : 'Back';
  const col = nz < 1 / 3 ? 'Left' : nz < 2 / 3 ? 'Center' : 'Right';
  return `${row}-${col}`;
}

// Places devices: saved x/y coords → named position → spread along the centre line.
// Devices sharing a named cell are fanned out so they don't overlap.
function placeDevices(devices, overrides) {
  const unplaced = [];
  const perCell = {};
  const placed = devices.map(d => {
    const id = String(d._id ?? d.id ?? d.device_id);
    if (overrides[id]) return { device: d, id, ...overrides[id] };
    if (typeof d.x_coord === 'number' && typeof d.y_coord === 'number') {
      return { device: d, id, nx: d.x_coord, nz: d.y_coord };
    }
    const n = positionToNorm(d.position);
    if (n) {
      const k = d.position;
      const i = (perCell[k] = (perCell[k] ?? -1) + 1);
      return { device: d, id, nx: n.nx + i * 0.05, nz: n.nz + (i % 2 ? 0.08 : 0) };
    }
    // off the centre line, where feeders/heaters usually sit
    const entry = { device: d, id, nx: 0, nz: 0.27 };
    unplaced.push(entry);
    return entry;
  });
  // spread along the length, skewed away from the middle (common heater spot)
  unplaced.forEach((e, i) => { e.nx = 0.3 + (0.64 * (i + 0.5)) / unplaced.length; });
  return placed;
}

// ── Metrics & colour scales (thresholds match the default alert rules) ────
const METRICS = {
  temperature: {
    label: 'Temperature', short: 'Temp', unit: '°C', digits: 1,
    stops: [[18, '#3b82f6'], [24, '#22c55e'], [30, '#22c55e'], [32, '#f59e0b'], [35, '#ef4444']],
    status: v => (v >= 35 ? 'danger' : v >= 32 || v < 18 ? 'warn' : 'ok'),
  },
  humidity: {
    label: 'Humidity', short: 'RH', unit: '%', digits: 0,
    stops: [[35, '#f59e0b'], [50, '#22c55e'], [70, '#22c55e'], [75, '#f59e0b'], [85, '#ef4444']],
    status: v => (v >= 85 ? 'danger' : v >= 75 || v < 35 ? 'warn' : 'ok'),
  },
  ammonia: {
    label: 'Ammonia', short: 'NH₃', unit: 'ppm', digits: 1,
    stops: [[0, '#22c55e'], [10, '#22c55e'], [15, '#f59e0b'], [25, '#ef4444']],
    status: v => (v >= 25 ? 'danger' : v >= 15 ? 'warn' : 'ok'),
  },
};
const STATUS_COLOR = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)' };

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function colorFor(metric, v) {
  const stops = METRICS[metric].stops;
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [v0, c0] = stops[i];
    const [v1, c1] = stops[i + 1];
    if (v <= v1) {
      const t = (v - v0) / (v1 - v0 || 1);
      const a = hexToRgb(c0), b = hexToRgb(c1);
      return `rgb(${a.map((c, j) => Math.round(c + (b[j] - c) * t)).join(',')})`;
    }
  }
  return stops[stops.length - 1][1];
}

// ── Reading freshness ─────────────────────────────────────────────────────
const STALE_MS = 15 * 60 * 1000;

function parseTs(ts) {
  if (!ts) return null;
  if (typeof ts === 'object' && ts.$date) ts = ts.$date;
  const s = String(ts);
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return isNaN(d) ? null : d;
}
function ago(date) {
  if (!date) return 'never';
  const s = Math.max(0, Math.round((Date.now() - date) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
const fmt = (metric, v) => (v == null ? '—' : `${Number(v).toFixed(METRICS[metric].digits)}${METRICS[metric].unit}`);

// ── Actuator state helpers ────────────────────────────────────────────────
const kindOf = d => String(d?.device_type || d?.type || '').replace('actuator_', '').replace(/s$/, '');

function actuatorState(actuators, env, kind) {
  const dev = actuators?.find(a => kindOf(a) === kind);
  const envKey = kind === 'fan' ? 'fans' : kind;
  return dev?.current_state?.state ?? env?.actuators?.[envKey] ?? {};
}

// ── SVG pieces ────────────────────────────────────────────────────────────
// Cutaway house: far walls (z=0 long side, x=0 front end) full height,
// near walls (z=W long side, x=L back end) cut low so the floor stays visible.
function HouseShell({ children, overlay }) {
  const h = H * CUT;
  const floor = pts(P(0, 0, 0), P(L, 0, 0), P(L, 0, W), P(0, 0, W));
  const wallTop = { fill: 'var(--fp-wall-top)', stroke: 'var(--fp-edge)', strokeWidth: 0.6 };
  const T = 4; // wall thickness for the cut tops
  return (
    <g>
      {/* Far long wall with windows */}
      <polygon points={pts(P(0, 0, 0), P(L, 0, 0), P(L, H, 0), P(0, H, 0))} fill="var(--fp-wall)" stroke="var(--fp-edge)" strokeWidth="0.6" />
      {Array.from({ length: 12 }).map((_, i) => {
        const x0 = L * (0.04 + i * 0.08), x1 = x0 + L * 0.045, y0 = H * 0.45, y1 = H * 0.8;
        return <polygon key={i} points={pts(P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0))} fill="var(--fp-window)" stroke="var(--fp-edge)" strokeWidth="0.5" />;
      })}
      <polygon points={pts(P(0, H, 0), P(L, H, 0), P(L, H, -T), P(0, H, -T))} {...wallTop} />

      {/* Far end wall (front) with door */}
      <polygon points={pts(P(0, 0, 0), P(0, 0, W), P(0, H, W), P(0, H, 0))} fill="var(--fp-wall-end)" stroke="var(--fp-edge)" strokeWidth="0.6" />
      <polygon points={pts(P(0, 0, W * 0.4), P(0, 0, W * 0.6), P(0, H * 0.75, W * 0.6), P(0, H * 0.75, W * 0.4))} fill="var(--fp-door)" stroke="var(--fp-edge)" strokeWidth="0.6" />
      <polygon points={pts(P(0, H, 0), P(0, H, W), P(-T, H, W), P(-T, H, 0))} {...wallTop} />

      {/* Floor (litter) + thirds grid that matches the installation positions */}
      <polygon points={floor} fill="var(--fp-floor)" stroke="var(--fp-edge)" strokeWidth="0.8" />
      {[1 / 3, 2 / 3].map(f => (
        <g key={f} stroke="var(--fp-grid)" strokeWidth="0.8" strokeDasharray="4 4">
          <line x1={P(L * f, 0, 0).x} y1={P(L * f, 0, 0).y} x2={P(L * f, 0, W).x} y2={P(L * f, 0, W).y} />
          <line x1={P(0, 0, W * f).x} y1={P(0, 0, W * f).y} x2={P(L, 0, W * f).x} y2={P(L, 0, W * f).y} />
        </g>
      ))}

      {children}

      {/* Near walls, cut low */}
      <polygon points={pts(P(0, 0, W), P(L, 0, W), P(L, h, W), P(0, h, W))} fill="var(--fp-wall)" opacity="0.92" stroke="var(--fp-edge)" strokeWidth="0.6" />
      <polygon points={pts(P(0, h, W), P(L, h, W), P(L, h, W + T), P(0, h, W + T))} {...wallTop} />
      <polygon points={pts(P(L, 0, 0), P(L, 0, W), P(L, h, W), P(L, h, 0))} fill="var(--fp-wall-end)" opacity="0.92" stroke="var(--fp-edge)" strokeWidth="0.6" />
      <polygon points={pts(P(L, h, 0), P(L, h, W), P(L + T, h, W), P(L + T, h, 0))} {...wallTop} />

      {overlay}

      {/* Labels */}
      {[['Front', P(0, 0, W)], ['Back', P(L, 0, W)]].map(([t, p]) => (
        <text key={t} x={p.x} y={p.y + 18} textAnchor="middle" className="fp-label">{t}</text>
      ))}
      {[['Left', P(L * 0.5, H, 0), -8], ['Right', P(L * 0.5, 0, W), 20]].map(([t, p, dy]) => (
        <text key={t} x={p.x} y={p.y + dy} textAnchor="middle" className="fp-label">{t}</text>
      ))}
    </g>
  );
}

function CeilingLights({ level }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      {Array.from({ length: 8 }).map((_, i) => {
        const c = P(L * (0.08 + i * 0.12), H * 0.95, W / 2);
        const f = P(L * (0.08 + i * 0.12), 0, W / 2);
        return (
          <g key={i}>
            {level > 0 && <ellipse cx={f.x} cy={f.y} rx={26} ry={12} fill="#fde68a" opacity={0.04 + 0.1 * level} />}
            <line x1={c.x} y1={c.y - 6} x2={c.x} y2={c.y} stroke="var(--fp-edge)" strokeWidth="0.8" />
            <circle cx={c.x} cy={c.y} r={2.6} fill={level > 0 ? '#fbbf24' : 'var(--fp-edge)'} />
          </g>
        );
      })}
    </g>
  );
}

function Heatmap({ metric, points }) {
  const NX = 30, NZ = 9;
  const cells = [];
  for (let i = 0; i < NX; i++) {
    for (let k = 0; k < NZ; k++) {
      const cx = (i + 0.5) / NX, cz = (k + 0.5) / NZ;
      let num = 0, den = 0;
      for (const p of points) {
        // distance in metres-ish (house is ~3.3× longer than wide)
        const d2 = ((cx - p.nx) * 200) ** 2 + ((cz - p.nz) * 60) ** 2;
        const w = 1 / (d2 + 25);
        num += w * p.value; den += w;
      }
      const x0 = L * i / NX, x1 = L * (i + 1) / NX, z0 = W * k / NZ, z1 = W * (k + 1) / NZ;
      cells.push(
        <polygon key={`${i}-${k}`} points={pts(P(x0, 0.3, z0), P(x1, 0.3, z0), P(x1, 0.3, z1), P(x0, 0.3, z1))}
          fill={colorFor(metric, num / den)} stroke={colorFor(metric, num / den)} strokeWidth="0.4" />
      );
    }
  }
  return <g opacity="0.55" style={{ pointerEvents: 'none' }}>{cells}</g>;
}

function FeederLines({ running }) {
  return (
    <g>
      {[0.38, 0.62].map(nz => {
        const a = P(L * 0.05, 2, W * nz), b = P(L * 0.95, 2, W * nz);
        return <line key={nz} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={running ? '#22c55e' : 'var(--fp-edge)'} strokeWidth="3.5" strokeLinecap="round" opacity="0.9" />;
      })}
    </g>
  );
}

function Fans({ speed, running }) {
  const dur = running ? Math.max(0.25, 1.6 - speed / 70) : 0;
  return (
    <g>
      {[0.22, 0.5, 0.78].map(nz => {
        const c = P(L + 6, H * CUT + 14, W * nz);
        return (
          <g key={nz}>
            <line x1={c.x} y1={c.y + 14} x2={c.x} y2={c.y + 22} stroke="var(--fp-edge)" strokeWidth="2" />
            <circle cx={c.x} cy={c.y} r={14} fill="var(--fp-fan-housing)" stroke={running ? '#60a5fa' : 'var(--fp-edge)'} strokeWidth="1.5" />
            <g className={running ? 'fp-rotor fp-rotor-on' : 'fp-rotor'} style={running ? { animationDuration: `${dur}s` } : undefined}>
              {[0, 120, 240].map(a => (
                <ellipse key={a} cx={c.x + 6.5 * Math.cos(a * Math.PI / 180)} cy={c.y + 6.5 * Math.sin(a * Math.PI / 180)}
                  rx={6.5} ry={2.8} transform={`rotate(${a} ${c.x + 6.5 * Math.cos(a * Math.PI / 180)} ${c.y + 6.5 * Math.sin(a * Math.PI / 180)})`}
                  fill={running ? '#93c5fd' : 'var(--text-dim)'} />
              ))}
              <circle cx={c.x} cy={c.y} r={0.01} fill="none" />{/* keeps fill-box centred on the hub */}
            </g>
            <circle cx={c.x} cy={c.y} r={2.5} fill={running ? '#60a5fa' : 'var(--text-dim)'} />
          </g>
        );
      })}
    </g>
  );
}

function Silo() {
  const b = P(-38, 0, W * 0.2);
  const inlet = P(0, H * 0.6, W * 0.2);
  return (
    <g>
      <line x1={b.x + 10} y1={b.y - 56} x2={inlet.x} y2={inlet.y} stroke="var(--fp-edge)" strokeWidth="3" />
      <polygon points={`${b.x - 13},${b.y - 22} ${b.x + 13},${b.y - 22} ${b.x},${b.y - 6}`} fill="var(--fp-wall-end)" stroke="var(--fp-edge)" />
      <rect x={b.x - 13} y={b.y - 74} width={26} height={52} fill="var(--fp-wall)" stroke="var(--fp-edge)" />
      <polygon points={`${b.x - 13},${b.y - 74} ${b.x + 13},${b.y - 74} ${b.x},${b.y - 92}`} fill="var(--fp-wall-top)" stroke="var(--fp-edge)" />
      <text x={b.x} y={b.y + 10} textAnchor="middle" className="fp-label">Silo</text>
    </g>
  );
}

function ActuatorNode({ x, z, kind, state, onHover }) {
  const f = P(x, 0, z);
  const heaterOn = kind === 'heater' && state?.active === true;
  const glyph = { heater: 'H', fan: 'F', lighting: 'L', feeder: 'D', water: 'W' }[kind] ?? '?';
  return (
    <g onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(null)} style={{ cursor: 'default' }}>
      {heaterOn && <ellipse cx={f.x} cy={f.y} rx={46} ry={24} fill="url(#fp-heat-glow)" style={{ pointerEvents: 'none' }} />}
      <polygon points={`${f.x},${f.y - 9} ${f.x + 10},${f.y} ${f.x},${f.y + 9} ${f.x - 10},${f.y}`}
        fill="var(--bg-panel)" stroke={heaterOn ? '#f97316' : 'var(--border-bright)'} strokeWidth="1.5" />
      <text x={f.x} y={f.y + 3.5} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, fill: heaterOn ? '#f97316' : 'var(--text-secondary)' }}>{glyph}</text>
    </g>
  );
}

function SensorPin({ p, metric, value, stale, selected, editMode, onHover, onPointerDown }) {
  const f = P(L * p.nx, 0, W * p.nz);
  const top = P(L * p.nx, 16, W * p.nz);
  const color = stale || value == null ? 'var(--text-dim)' : STATUS_COLOR[METRICS[metric].status(value)];
  const label = stale && value == null ? 'offline' : fmt(metric, value);
  const w = Math.max(40, label.length * 7 + 12);
  return (
    <g
      onMouseEnter={() => onHover(p.id)} onMouseLeave={() => onHover(null)}
      onPointerDown={editMode ? e => onPointerDown(e, p.id) : undefined}
      style={{ cursor: editMode ? 'grab' : 'pointer' }}
      opacity={stale ? 0.6 : 1}
    >
      <ellipse cx={f.x} cy={f.y} rx={selected ? 9 : 6} ry={selected ? 4.5 : 3} fill={color} opacity="0.35" />
      <line x1={f.x} y1={f.y} x2={top.x} y2={top.y} stroke={color} strokeWidth="1.5" strokeDasharray={stale ? '2 2' : undefined} />
      <circle cx={top.x} cy={top.y} r={selected ? 6 : 4.5} fill={color} stroke="var(--bg-panel)" strokeWidth="1.5" />
      <g transform={`translate(${top.x - w / 2}, ${top.y - 27})`}>
        <rect width={w} height={18} rx={9} fill="var(--bg-panel)" stroke={selected ? color : 'var(--border-mid)'} strokeWidth={selected ? 1.5 : 1} />
        <text x={w / 2} y={12.5} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, fill: color }}>{label}</text>
      </g>
      {/* larger invisible hit area */}
      <circle cx={top.x} cy={top.y - 8} r={16} fill="transparent" />
    </g>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function FloorPlanView({ house, houseId: houseIdProp, sensors = [], actuators = [], onUpdateDevice }) {
  const houseId = houseIdProp ?? house?.id ?? house?._id;
  const houseName = house?.name ?? house?.house_code ?? 'House';

  const [env, setEnv] = useState(null);
  const [metric, setMetric] = useState('temperature');
  const [layers, setLayers] = useState({ heatmap: true, sensors: true, equipment: true });
  const [hovered, setHovered] = useState(null);       // { kind: 'sensor'|'actuator', id }
  const [editMode, setEditMode] = useState(false);
  const [overrides, setOverrides] = useState({});     // id → { nx, nz } (local, after drag)
  const [dragging, setDragging] = useState(null);
  const [, setTick] = useState(0);
  const svgRef = useRef(null);

  // External conditions + actuator state fallback
  useEffect(() => {
    if (!houseId) return;
    api.getHouseEnvironment(houseId).then(setEnv).catch(() => {});
  }, [houseId]);

  useWSSubscribe('control_update', useCallback((msg) => {
    if (msg.house_id !== houseId) return;
    setEnv(prev => prev && {
      ...prev,
      actuators: { ...prev.actuators, [msg.device_type]: { ...prev.actuators?.[msg.device_type], ...msg.state } },
    });
  }, [houseId]));

  // Re-render every 30 s so "x min ago" and stale markers stay current
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // ── Derived data ──
  const placedSensors = useMemo(() => placeDevices(sensors, overrides).map(p => {
    const r = p.device.latest_reading ?? {};
    const ts = parseTs(r.timestamp ?? p.device.last_seen);
    return { ...p, reading: r, ts, stale: !ts || Date.now() - ts > STALE_MS };
  }), [sensors, overrides]);

  const placedActuators = useMemo(() => placeDevices(actuators, {}), [actuators]);

  const live = placedSensors.filter(s => !s.stale && s.reading[metric] != null);
  const heatPoints = live.map(s => ({ nx: s.nx, nz: s.nz, value: s.reading[metric] }));
  const values = live.map(s => s.reading[metric]);
  const stats = values.length ? {
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  } : null;

  const fan = actuatorState(actuators, env, 'fan');
  const heater = actuatorState(actuators, env, 'heater');
  const light = actuatorState(actuators, env, 'lighting');
  const feeder = actuatorState(actuators, env, 'feeder');
  const fanSpeed = fan.speed ?? fan.speed_percent ?? 0;
  const fanRunning = fan.running !== false && fanSpeed > 0;
  const lightLevel = Math.max(0, Math.min(1, (light.brightness ?? 0) / 100));

  // ── Drag to reposition ──
  const toSvg = e => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };

  const startDrag = (e, id) => {
    e.preventDefault();
    const s = placedSensors.find(p => p.id === id);
    setDragging({ id, from: { nx: s.nx, nz: s.nz } });
  };

  useEffect(() => {
    if (!dragging) return;
    let target = null;
    const move = e => {
      const p = toSvg(e);
      target = screenToNorm(p.x, p.y);
      setOverrides(o => ({ ...o, [dragging.id]: target }));
    };
    const up = async () => {
      const id = dragging.id;
      setDragging(null);
      if (!target || !onUpdateDevice) return;
      const nx = +target.nx.toFixed(3), nz = +target.nz.toFixed(3);
      try {
        await onUpdateDevice(id, { x_coord: nx, y_coord: nz, position: normToPosition(nx, nz) });
      } catch (err) {
        setOverrides(o => ({ ...o, [id]: dragging.from }));
        toast.error(err?.response?.status === 403 ? 'Only supervisors and admins can move devices' : 'Could not save position');
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dragging, onUpdateDevice]);

  // ── Tooltip content ──
  const hoverSensor = hovered?.kind === 'sensor' && !dragging ? placedSensors.find(s => s.id === hovered.id) : null;
  const hoverAct = hovered?.kind === 'actuator' ? placedActuators.find(a => a.id === hovered.id) : null;
  const tipAnchor = hoverSensor ? P(L * hoverSensor.nx, 16, W * hoverSensor.nz)
    : hoverAct ? P(L * hoverAct.nx, 0, W * hoverAct.nz) : null;

  const toggle = k => setLayers(l => ({ ...l, [k]: !l[k] }));
  const btn = active => ({
    padding: '4px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
    textTransform: 'uppercase', border: '1px solid', cursor: 'pointer', borderRadius: 'var(--radius-md)',
    borderColor: active ? 'var(--accent)' : 'var(--border-dim)',
    background: active ? 'var(--accent-glow)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
  });

  const m = METRICS[metric];
  const legendGradient = `linear-gradient(90deg, ${m.stops.map(([v, c]) => `${c} ${((v - m.stops[0][0]) / (m.stops.at(-1)[0] - m.stops[0][0])) * 100}%`).join(', ')})`;

  return (
    <div className="panel fp-root" style={{ padding: 0, overflow: 'hidden' }}>
      <style>{`
        .fp-root { --fp-floor:#dcc39a; --fp-wall:#e6e0d4; --fp-wall-end:#d6cebf; --fp-wall-top:#f6f3ec; --fp-door:#b9ad97; --fp-edge:#a39a88;
                   --fp-grid:rgba(120,95,50,.35); --fp-window:rgba(150,190,230,.6); --fp-fan-housing:#33475c; }
        .dark .fp-root { --fp-floor:#4f412d; --fp-wall:#22303f; --fp-wall-end:#1b2734; --fp-wall-top:#33465c; --fp-door:#121b25; --fp-edge:#3d556e;
                   --fp-grid:rgba(255,220,160,.16); --fp-window:rgba(96,165,250,.28); --fp-fan-housing:#0f1a26; }
        .fp-label { font-family: var(--font-mono); font-size: 9px; letter-spacing: .1em; fill: var(--text-dim); }
        .fp-rotor { transform-box: fill-box; transform-origin: center; }
        .fp-rotor-on { animation: fanRotate 1s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .fp-rotor-on { animation: none; } }
        .fp-stat { display:flex; flex-direction:column; gap:2px; min-width:72px; }
        .fp-stat span:first-child { font-family:var(--font-mono); font-size:9px; letter-spacing:.08em; color:var(--text-dim); text-transform:uppercase; }
        .fp-stat span:last-child { font-family:var(--font-mono); font-size:14px; color:var(--text-primary); }
      `}</style>

      {/* Header */}
      <div className="panel-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
            {houseName} · Spatial view
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
            {live.length}/{placedSensors.length} sensors live
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(METRICS).map(([k, v]) => (
            <button key={k} style={btn(metric === k)} onClick={() => setMetric(k)}>{v.short}</button>
          ))}
          <span style={{ width: 1, background: 'var(--border-dim)', margin: '0 4px' }} />
          {['heatmap', 'sensors', 'equipment'].map(k => (
            <button key={k} style={btn(layers[k])} onClick={() => toggle(k)} aria-pressed={layers[k]}>{k}</button>
          ))}
          {onUpdateDevice && (
            <button style={btn(editMode)} onClick={() => setEditMode(e => !e)}>
              {editMode ? 'Done' : 'Edit layout'}
            </button>
          )}
        </div>
      </div>

      {editMode && (
        <div style={{ padding: '6px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', background: 'var(--accent-glow)', borderBottom: '1px solid var(--border-dim)' }}>
          Drag sensors to where they are physically installed. Positions are saved on drop.
        </div>
      )}

      {/* Drawing */}
      <div style={{ background: 'var(--bg-void)', padding: '8px 16px' }}>
      <div style={{ position: 'relative', margin: '0 auto', maxWidth: `${(480 * VB.w) / VB.h}px` }}>
        <svg ref={svgRef} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} width="100%" style={{ display: 'block', touchAction: editMode ? 'none' : 'auto', userSelect: 'none' }}
          role="img" aria-label={`Isometric view of ${houseName} showing ${placedSensors.length} sensors`}>
          <defs>
            <radialGradient id="fp-heat-glow">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
            </radialGradient>
          </defs>

          <Silo />
          <HouseShell overlay={<>
            {layers.equipment && <Fans speed={fanSpeed} running={fanRunning} />}
            {layers.sensors && [...placedSensors].sort((a, b) => (a.nx * L + a.nz * W) - (b.nx * L + b.nz * W)).map(s => (
              <SensorPin key={s.id} p={s} metric={metric} value={s.reading[metric]} stale={s.stale}
                selected={hovered?.id === s.id || dragging?.id === s.id} editMode={editMode}
                onHover={id => setHovered(id ? { kind: 'sensor', id } : null)} onPointerDown={startDrag} />
            ))}
          </>}>
            {layers.heatmap && heatPoints.length > 0 && <Heatmap metric={metric} points={heatPoints} />}
            {layers.equipment && <FeederLines running={!!feeder.running} />}
            {layers.equipment && placedActuators.map(a => (
              <ActuatorNode key={a.id} x={L * a.nx} z={W * a.nz} kind={kindOf(a.device)}
                state={kindOf(a.device) === 'heater' ? heater : a.device.current_state?.state}
                onHover={v => setHovered(v === null ? null : { kind: 'actuator', id: a.id })} />
            ))}
            {layers.equipment && <CeilingLights level={lightLevel} />}
          </HouseShell>
        </svg>

        {/* Hover card */}
        {tipAnchor && (hoverSensor || hoverAct) && (
          <div style={{
            position: 'absolute', left: `${((tipAnchor.x - VB.x) / VB.w) * 100}%`, top: `${((tipAnchor.y - VB.y) / VB.h) * 100}%`,
            transform: 'translate(-50%, calc(-100% - 44px))', pointerEvents: 'none', zIndex: 5,
            background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 6,
            boxShadow: 'var(--shadow-panel)', padding: '8px 10px', minWidth: 170,
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)',
          }}>
            {hoverSensor && (
              <>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{hoverSensor.device.name ?? hoverSensor.id}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, marginBottom: 6 }}>
                  {(!overrides[hoverSensor.id] && hoverSensor.device.position) || normToPosition(hoverSensor.nx, hoverSensor.nz)} ·{hoverSensor.stale ? `stale (${ago(hoverSensor.ts)})` : ago(hoverSensor.ts)}
                </div>
                {Object.keys(METRICS).map(k => {
                  const v = hoverSensor.reading[k];
                  return (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: k === metric ? 700 : 400 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{METRICS[k].label}</span>
                      <span style={{ color: v == null ? 'var(--text-dim)' : STATUS_COLOR[METRICS[k].status(v)] }}>{fmt(k, v)}</span>
                    </div>
                  );
                })}
              </>
            )}
            {hoverAct && (
              <>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{hoverAct.device.name ?? hoverAct.id}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>
                  {kindOf(hoverAct.device)} · {hoverAct.device.position ?? 'no position set'} · {hoverAct.device.status ?? 'unknown'}
                </div>
              </>
            )}
          </div>
        )}

        {placedSensors.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 6, padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
              No sensors registered in this house yet.
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Legend + stats */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 28px', padding: '12px 16px', borderTop: '1px solid var(--border-dim)' }}>
        <div style={{ minWidth: 200, flex: '0 1 260px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 4 }}>
            {m.label} ({m.unit})
          </div>
          <div style={{ height: 8, borderRadius: 4, background: legendGradient }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
            <span>{m.stops[0][0]}</span><span>{m.stops.at(-1)[0]}+</span>
          </div>
        </div>
        <div className="fp-stat"><span>Avg</span><span>{fmt(metric, stats?.avg)}</span></div>
        <div className="fp-stat"><span>Min</span><span>{fmt(metric, stats?.min)}</span></div>
        <div className="fp-stat"><span>Max</span><span>{fmt(metric, stats?.max)}</span></div>
        <div className="fp-stat"><span>Spread</span><span>{stats ? fmt(metric, stats.max - stats.min) : '—'}</span></div>
        <div className="fp-stat"><span>Outside</span><span>
          {env?.external?.temperature != null ? `${Number(env.external.temperature).toFixed(1)}°C` : '—'}
          {env?.external?.humidity != null ? ` · ${Math.round(env.external.humidity)}%` : ''}
        </span></div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          <span style={{ color: fanRunning ? 'var(--info)' : undefined }}>Fans {fanRunning ? `${fanSpeed}%` : 'off'}</span>
          <span style={{ color: heater.active ? 'var(--danger)' : undefined }}>Heater {heater.active ? `on${heater.target_temp != null ? ` → ${heater.target_temp}°C` : ''}` : 'off'}</span>
          <span style={{ color: lightLevel > 0 ? 'var(--warn)' : undefined }}>Lights {lightLevel > 0 ? `${light.brightness}%` : 'off'}</span>
          <span style={{ color: feeder.running ? 'var(--ok)' : undefined }}>Feeder {feeder.running ? 'running' : 'idle'}</span>
        </div>
      </div>
    </div>
  );
}
