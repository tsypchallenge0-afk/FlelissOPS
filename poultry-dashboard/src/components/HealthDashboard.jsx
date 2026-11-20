import React, { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { api } from '../lib/Api';

// Brooding target temperature by flock age (°C)
function targetTempFor(ageDays) {
    if (ageDays <= 3) return 32;
    if (ageDays <= 7) return 31;
    if (ageDays <= 14) return 29;
    if (ageDays <= 21) return 27;
    if (ageDays <= 28) return 24;
    return 21;
}

const getScoreColor = (score) => {
    if (score == null) return 'var(--text-dim)';
    if (score >= 90) return 'var(--ok)';
    if (score >= 75) return 'var(--info)';
    if (score >= 60) return 'var(--warn)';
    return 'var(--danger)';
};

function KpiCard({ label, value, unit, color, note, noteColor }) {
    return (
        <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span className="mono dim" style={{ fontSize: '10px', marginBottom: '8px' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '32px', fontWeight: 700, color: value == null ? 'var(--text-dim)' : (color || 'var(--text-primary)') }}>{value ?? '—'}</span>
                {value != null && unit && <span className="mono dim" style={{ fontSize: '12px' }}>{unit}</span>}
            </div>
            {note && <span className="mono" style={{ fontSize: '10px', color: noteColor || 'var(--text-dim)', marginTop: '4px' }}>{note}</span>}
        </div>
    );
}

export default function HealthDashboard({ telemetry, activeFlock }) {
    const flockId = activeFlock?._id || activeFlock?.id;
    const [kpis, setKpis] = useState(null);

    // Real flock KPIs (mortality, weight vs breed standard, FCR) from the backend
    useEffect(() => {
        if (!flockId) return;
        let alive = true;
        const load = () => api.getFlockKPIs(flockId).then(k => { if (alive) setKpis(k); }).catch(() => {});
        load();
        const t = setInterval(load, 60000);
        return () => { alive = false; clearInterval(t); };
    }, [flockId]);


    const latestVal = useMemo(() => telemetry[telemetry.length - 1] || {}, [telemetry]);

    const healthMetrics = useMemo(() => {
        if (!activeFlock) return null;
        const ageDays = kpis?.age_days ?? 0;
        const targetTemp = targetTempFor(ageDays);

        // Temperature (40%): on target = 100, 5 °C or more off = 0
        const tempScoreRaw = latestVal.temperature != null
            ? Math.max(0, 100 - Math.abs(latestVal.temperature - targetTemp) * 20) : null;
        // Ammonia (20%): 0 ppm = 100, 30 ppm or more = 0
        const nh3ScoreRaw = latestVal.ammonia != null
            ? Math.max(0, 100 - latestVal.ammonia * 3.33) : null;
        // Survival (40%): cumulative mortality ≤ 2 % = 100, ≥ 5 % = 0
        const mortality = kpis?.mortality_rate ?? null;
        const mortScoreRaw = mortality != null
            ? (mortality <= 2 ? 100 : Math.max(0, 100 - (mortality - 2) * 33)) : null;

        // Weighted score over the parts we actually have data for
        const parts = [[tempScoreRaw, 0.4], [nh3ScoreRaw, 0.2], [mortScoreRaw, 0.4]].filter(([v]) => v != null);
        const weight = parts.reduce((a, [, w]) => a + w, 0);
        const score = weight ? Math.round(parts.reduce((a, [v, w]) => a + v * w, 0) / weight) : null;

        const r = v => (v == null ? null : Math.round(v));
        return { score, tempScoreRaw: r(tempScoreRaw), nh3ScoreRaw: r(nh3ScoreRaw), mortScoreRaw: r(mortScoreRaw), targetTemp };
    }, [activeFlock, kpis, latestVal]);

    if (!activeFlock) {
        return (
            <div className="panel fade-in" style={{ padding: '40px', textAlign: 'center' }}>
                <div className="mono" style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 6 }}>No active flock in this house</div>
                <div className="mono dim" style={{ fontSize: 11 }}>Place a flock from Flock Management to track health, mortality and growth.</div>
            </div>
        );
    }

    const scoreColor = getScoreColor(healthMetrics.score);
    const dev = kpis?.growth_deviation_pct;
    const weightNote = kpis?.latest_weight_g != null
        ? `${dev >= 0 ? '+' : ''}${dev}% vs ${activeFlock.breed || 'breed'} standard (${kpis.standard_weight_g} g)`
        : kpis ? `No weigh-in yet · standard ${kpis.standard_weight_g} g at day ${kpis.age_days}` : 'Loading…';

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Top Row: Main Score and KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 7fr)', gap: '24px' }}>

                {/* Main Score Widget */}
                <div className="panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderTop: `4px solid ${scoreColor}`, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: scoreColor, filter: 'blur(80px)', opacity: 0.2 }} />
                    <span className="mono" style={{ color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '16px' }}>Overall flock health</span>

                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '180px', height: '180px', borderRadius: '50%', background: 'var(--bg-surface)', border: `8px solid ${scoreColor}`, boxShadow: `0 0 30px ${scoreColor}40, inset 0 0 20px rgba(0,0,0,0.5)` }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '64px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', lineHeight: '1' }}>
                                {healthMetrics.score ?? '—'}
                            </span>
                            <span className="mono" style={{ fontSize: '12px', color: scoreColor, fontWeight: 600 }}>/ 100</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', marginTop: '24px', width: '100%', justifyContent: 'center' }}>
                        {[['TEMP (40%)', healthMetrics.tempScoreRaw], ['NH3 (20%)', healthMetrics.nh3ScoreRaw], ['SURVIVAL (40%)', healthMetrics.mortScoreRaw]].map(([label, v]) => (
                            <div key={label} style={{ textAlign: 'center' }}>
                                <div className="mono dim" style={{ fontSize: '9px' }}>{label}</div>
                                <div className="mono" style={{ fontSize: '12px', color: getScoreColor(v) }}>{v ?? '—'}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Performance KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '16px' }}>
                    <KpiCard label="Flock age" value={kpis?.age_days ?? null} unit="Days"
                        note={`TARGET TEMP: ${healthMetrics.targetTemp}°C${kpis ? ` · ${kpis.days_to_target} days to target` : ''}`} noteColor="var(--ok)" />
                    <KpiCard label="Cumulative mortality" value={kpis ? kpis.mortality_rate.toFixed(2) : null} unit="%"
                        color={kpis?.mortality_rate > 3 ? 'var(--danger)' : kpis?.mortality_rate > 2 ? 'var(--warn)' : 'var(--ok)'}
                        note={kpis ? `${kpis.total_mortality} of ${kpis.placement_count} birds · standard < 3.0%` : 'Standard: < 3.0%'} />
                    <KpiCard label="Feed conversion (FCR)" value={kpis?.fcr ?? null} color="var(--info)"
                        note={kpis?.fcr != null ? `${kpis.total_feed_kg} kg feed logged` : 'Log feed and weight entries to compute'} />
                    <KpiCard label="Average bird weight" value={kpis?.latest_weight_g != null ? Math.round(kpis.latest_weight_g).toLocaleString() : null} unit="g"
                        note={weightNote} noteColor={dev == null ? undefined : dev >= -5 ? 'var(--ok)' : 'var(--warn)'} />
                </div>
            </div>

            {/* Bottom Row: Environmental Stability */}
            <div className="panel" style={{ height: '350px', display: 'flex', flexDirection: 'column' }}>
                <div className="panel-header">
                    <span className="panel-title">Environmental stability trend (last 60 readings)</span>
                </div>
                <div style={{ flex: 1, padding: '0 20px 20px 0', minHeight: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%" debounce={50}>
                        <AreaChart data={telemetry} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="var(--danger)" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorHum" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--info)" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="var(--info)" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" vertical={false} />
                            <XAxis dataKey="time" stroke="var(--text-dim)" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} dy={10} />
                            <YAxis yAxisId="temp" stroke="var(--danger)" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} domain={[15, 40]} />
                            <YAxis yAxisId="hum" orientation="right" stroke="var(--info)" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} axisLine={false} domain={[30, 90]} />
                            <RechartsTooltip
                                contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-mid)', borderRadius: '8px', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                            />
                            <Area yAxisId="temp" type="monotone" dataKey="temperature" stroke="var(--danger)" fillOpacity={1} fill="url(#colorTemp)" isAnimationActive={false} />
                            <Area yAxisId="hum" type="monotone" dataKey="humidity" stroke="var(--info)" fillOpacity={1} fill="url(#colorHum)" isAnimationActive={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
