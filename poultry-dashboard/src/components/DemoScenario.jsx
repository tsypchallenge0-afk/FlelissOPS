import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/Api';
import { useWSSubscribe } from '../context/WSContext';
import RoleLock from './RoleLock';
import { sentence } from '../lib/format';

/**
 * "Run heat-stress demo" button + live progress panel.
 * The backend replays a heat wave on this house's real sensors; alerts, the AI
 * decision and the actuator commands all go through the production pipeline.
 */

const PHASES = [
  { id: 'heat_wave', label: 'Heat wave' },
  { id: 'ai_response', label: 'AI response' },
  { id: 'recovery', label: 'Recovery' },
  { id: 'done', label: 'Done' },
];

const mono = { fontFamily: 'var(--font-mono)' };

function Stat({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ ...mono, fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ ...mono, fontSize: 16, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value ?? '—'}</span>
    </div>
  );
}

export default function DemoScenario({ houseId }) {
  const [run, setRun] = useState(null);       // latest status from the backend
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  // Resume an in-progress run (e.g. after a page refresh)
  useEffect(() => {
    if (!houseId) return;
    api.getDemoStatus(houseId).then(st => {
      if (st?.state === 'running') { setRun(st); setOpen(true); }
    }).catch(() => {});
  }, [houseId]);

  useWSSubscribe('demo_scenario', useCallback((msg) => {
    if (msg.house_id !== houseId) return;
    setRun(msg);
    setOpen(true);
  }, [houseId]));

  const start = async () => {
    setStarting(true);
    try {
      const st = await api.startHeatStressDemo(houseId);
      setRun(st);
      setOpen(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not start the demo');
    } finally {
      setStarting(false);
    }
  };

  const running = run?.state === 'running';
  const phaseIdx = Math.max(0, PHASES.findIndex(p => p.id === run?.phase));
  const executed = (run?.ai_actions || []).filter(a => a.executed);
  const blocked = (run?.ai_actions || []).filter(a => !a.executed);
  const tempColor = (t) => (t == null ? undefined : t >= 35 ? 'var(--danger)' : t >= 32 ? 'var(--warn)' : 'var(--ok)');

  return (
    <>
      <RoleLock requires="supervisor" tooltip="Supervisors and admins can run the demo">
        <button
          type="button"
          className={running ? 'btn btn-primary' : 'btn btn-ghost'}
          onClick={running ? () => setOpen(true) : start}
          disabled={starting}
          title="Simulate a heat wave on this house's sensors and watch alerts and the AI respond"
        >
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: running ? '#fff' : 'var(--danger)' }} />
          {running ? `Demo running · ${run.progress ?? 0}%` : starting ? 'Starting…' : 'Heat-stress demo'}
        </button>
      </RoleLock>

      {open && run && (
        <div role="dialog" aria-label="Heat-stress demo" style={{
          position: 'fixed', right: 24, bottom: 24, width: 400, maxWidth: 'calc(100vw - 32px)', zIndex: 60,
          background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-dim)' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
              Heat-stress scenario
            </span>
            <button onClick={() => setOpen(false)} aria-label="Close"
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* Phase stepper */}
          <div style={{ display: 'flex', gap: 6, padding: '12px 16px 4px' }}>
            {PHASES.map((p, i) => {
              const done = run.state !== 'running' || i < phaseIdx;
              const active = run.state === 'running' && i === phaseIdx;
              return (
                <div key={p.id} style={{ flex: 1 }}>
                  <div style={{ height: 4, borderRadius: 2, background: done ? 'var(--ok)' : active ? 'var(--danger)' : 'var(--border-dim)',
                    animation: active ? 'pulse 1.2s ease-in-out infinite' : undefined }} />
                  <div style={{ ...mono, fontSize: 9, marginTop: 4, color: active ? 'var(--text-primary)' : 'var(--text-dim)' }}>{p.label}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '10px 16px' }}>
            <Stat label="Now (max)" value={run.current_max_temp != null ? `${run.current_max_temp}°` : null} color={tempColor(run.current_max_temp)} />
            <Stat label="Peak" value={run.peak_temp != null ? `${run.peak_temp}°` : null} color={tempColor(run.peak_temp)} />
            <Stat label="Alerts" value={run.alerts_raised} color={run.alerts_raised ? 'var(--danger)' : undefined} />
            <Stat label="Breach → AI" value={run.ai_latency_ms != null ? `${run.ai_latency_ms} ms` : null} color="var(--info)" />
          </div>

          {(executed.length > 0 || blocked.length > 0) && (
            <div style={{ padding: '0 16px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {executed.map((a, i) => (
                <div key={`e${i}`} style={{ ...mono, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--ok)', fontWeight: 700 }}>AI ▸ {sentence(a.device)}</span>{' '}
                  {a.device === 'fan' ? `${a.payload?.speed_percent ?? 0}%` : a.payload?.running ? 'ON' : 'Off'} — {a.reason}
                </div>
              ))}
              {blocked.map((a, i) => (
                <div key={`b${i}`} style={{ ...mono, fontSize: 11, color: 'var(--warn)' }}>⚠ {a.reason}</div>
              ))}
            </div>
          )}

          <div style={{ maxHeight: 130, overflowY: 'auto', padding: '8px 16px 14px', borderTop: '1px solid var(--border-dim)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(run.log || []).slice().reverse().map((l, i) => (
              <div key={i} style={{ ...mono, fontSize: 10.5, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
                <span style={{ color: 'var(--text-dim)', minWidth: 38 }}>{l.t.toFixed(1)}s</span>
                <span>{l.message}</span>
              </div>
            ))}
          </div>

          {run.state !== 'running' && (
            <div style={{ padding: '0 16px 14px', display: 'flex', justifyContent: 'flex-end' }}>
              <RoleLock requires="supervisor">
                <button onClick={start} disabled={starting}
                  style={{ ...mono, fontSize: 10, letterSpacing: '0.1em', padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                    border: '1px solid var(--border-mid)', background: 'transparent', color: 'var(--text-secondary)' }}>
                  ↻ Run again
                </button>
              </RoleLock>
            </div>
          )}
        </div>
      )}
    </>
  );
}
