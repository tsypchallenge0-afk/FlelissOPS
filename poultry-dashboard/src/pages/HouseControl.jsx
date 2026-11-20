import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/Api';
import ErrorBoundary from '../components/ErrorBoundary';
import { useActuatorState } from '../hooks/useActuatorState';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, ReferenceLine, ReferenceArea, ReferenceDot
} from 'recharts';
import CommandButton from '../components/CommandButton';
import ConfirmModal from '../components/ConfirmModal';
import { useWSSubscribe } from '../context/WSContext';
import { useRole } from '../context/AuthContext';
import PredictionPanel from '../components/PredictionPanel';
import { usePredictions } from '../hooks/usePredictions';
import Skeleton from '../components/Skeleton';
import AIActionLog from '../components/AIActionLog';
import AIActionHistory from '../components/AIActionHistory';
import { toast } from 'sonner';
import { useHouseDevices } from '../hooks/useHouseDevices';
import FloorPlanView from '../components/FloorPlanView';
import SensorGrid from '../components/SensorGrid';
import ActuatorGrid from '../components/ActuatorGrid';
import RadialGauge from '../components/RadialGauge';
import HealthDashboard from '../components/HealthDashboard';
import DemoScenario from '../components/DemoScenario';
import { sentence } from '../lib/format';

export default function HouseControl() {
    const { houseId } = useParams();

    const [house, setHouse] = useState(null);
    const [telemetry, setTelemetry] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [_devices, setDevices] = useState([]);
    const [activeFlock, setActiveFlock] = useState(null);
    const [todaySetpoints, setTodaySetpoints] = useState(null);
    // eslint-disable-next-line no-unused-vars
    const [loading, setLoading] = useState(true);

    const { state: controls } = useActuatorState(houseId);
    const role = useRole();
    const canEdit = role === 'admin' || role === 'supervisor';

    const [overrideModal, setOverrideModal] = useState({ open: false, device: null, type: null });

    const { predictions, anomalies } = usePredictions(houseId);
    const { sensors, actuators, loading: devicesLoading } = useHouseDevices(houseId);
    const [activeTab, setActiveTab] = useState('OPERATIONS');

    const formatTime = (value) => {
        if (!value) return '';
        try {
            return new Date(value).toLocaleTimeString('en-GB');
        } catch (_e) {
            return '';
        }
    };

    // One house-level series for the charts: readings from several sensors arrive
    // interleaved, so average them per 10-second window instead of zig-zagging between sensors.
    const houseSeries = useMemo(() => {
        const toMs = (ts) => {
            if (!ts) return NaN;
            const s = String(ts);
            return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`).getTime();
        };
        const buckets = new Map();
        for (const p of telemetry || []) {
            const ms = toMs(p.timestamp);
            if (Number.isNaN(ms)) continue;
            const key = Math.floor(ms / 10000);
            const b = buckets.get(key) || { ms: key * 10000, n: {}, sum: {} };
            for (const m of ['temperature', 'humidity', 'ammonia']) {
                if (typeof p[m] === 'number') { b.sum[m] = (b.sum[m] || 0) + p[m]; b.n[m] = (b.n[m] || 0) + 1; }
            }
            buckets.set(key, b);
        }
        return [...buckets.values()].sort((a, b) => a.ms - b.ms).map(b => ({
            timestamp: new Date(b.ms).toISOString(),
            time: new Date(b.ms).toLocaleTimeString('en-GB'),
            temperature: b.n.temperature ? +(b.sum.temperature / b.n.temperature).toFixed(2) : null,
            humidity: b.n.humidity ? +(b.sum.humidity / b.n.humidity).toFixed(2) : null,
            ammonia: b.n.ammonia ? +(b.sum.ammonia / b.n.ammonia).toFixed(2) : null,
        }));
    }, [telemetry]);

    const chartDataWithForecast = useMemo(() => {
        if (!houseSeries.length) return [];
        const base = houseSeries.map(d => ({ ...d }));

        const tempPredictions = predictions?.predictions?.temperature?.forecast ?? [];
        const humPredictions = predictions?.predictions?.humidity?.forecast ?? [];
        const nh3Predictions = predictions?.predictions?.ammonia?.forecast ?? [];
        const maxLen = Math.max(tempPredictions.length, humPredictions.length, nh3Predictions.length);

        if (maxLen === 0) return base;

        for (let i = 0; i < maxLen; i++) {
            const ts = tempPredictions[i]?.timestamp || humPredictions[i]?.timestamp || nh3Predictions[i]?.timestamp;
            if (!ts) continue;
            base.push({
                time: new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
                temperature: null,
                humidity: null,
                ammonia: null,
                temp_forecast: tempPredictions[i]?.value ?? null,
                hum_forecast: humPredictions[i]?.value ?? null,
                nh3_forecast: nh3Predictions[i]?.value ?? null,
                is_forecast: true,
            });
        }
        return base;
    }, [houseSeries, predictions]);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const [telRes, alertRes, devRes, houseRes, flockRes] = await Promise.all([
                    api.getTelemetry({ houseId, limit: 60 }),
                    api.getAlerts({ houseId, status: 'active' }),
                    api.getHouseDevices(houseId),
                    api.getHouse(houseId).catch(() => null),
                    api.getFlocks({ houseId: houseId, status: 'active' }).catch(() => [])
                ]);
                
                if (houseRes) setHouse(houseRes);
                if (flockRes && flockRes.length > 0) {
                    setActiveFlock(flockRes[0]);
                    api.getTodaysSetpoints(flockRes[0]._id || flockRes[0].id)
                        .then(res => setTodaySetpoints(res))
                        .catch(() => setTodaySetpoints(null));
                }

                setTelemetry((telRes || []).map(p => ({ ...p, time: formatTime(p.timestamp) })));
                setAlerts(alertRes || []);
                setDevices(devRes || []);
            } catch (err) {
                console.error("Failed to load house data", err);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, [houseId]);

    useWSSubscribe('telemetry', (msg) => {
        const point = msg.data || msg;
        if (point.house_id !== houseId && point.houseId !== houseId) return;
        const newPoint = { ...point, time: formatTime(point.timestamp || Date.now()) };
        setTelemetry(prev => [...prev.slice(-59), newPoint]);
    });

    useWSSubscribe('alert', (msg) => {
        // Filter alerts for this house only
        const newAlerts = (msg.alerts || []).filter(a => a.house_id === houseId || a.houseId === houseId);
        if (newAlerts.length > 0) {
            setAlerts(prev => {
                // Prevent duplicates
                const existingIds = new Set(prev.map(a => a.id));
                const uniqueNew = newAlerts.filter(a => !existingIds.has(a.id));
                return [...uniqueNew, ...prev].slice(0, 200);
            });
            toast.error(`${newAlerts.length} NEW INCIDENT(S) DETECTED`, {
                description: newAlerts.map(a => a.message).join(', ')
            });
        }
    });

    useWSSubscribe('alert_update', (msg) => {
        setAlerts(prev => prev.filter(a => a.id !== msg.alert_id));
    });

    useWSSubscribe('alert_bulk_update', (msg) => {
        if (msg.house_id === houseId || !msg.house_id) {
            setAlerts([]);
        }
    });

    useWSSubscribe('ai_action', useCallback((msg) => {
        if (msg.house_id !== houseId) return;
        toast(`AI adjusted ${msg.device_type} — ${(msg.triggered_by || '').replace(/_/g, ' ')}`, {
            description: msg.reason,
            duration: 6000,
        });
    }, [houseId]));

    const confirmOverride = async (reason) => {
        try {
            await api.setHouseControlMode(houseId, overrideModal.type, {
                mode: "manual", operator_id: "SYS", reason: reason || "Operator Override"
            });
            setOverrideModal({ open: false, device: null, type: null });
        } catch (_e) {
            toast.error("Override failed");
        }
    };

    const ackAlert = async (alertId) => {
        try {
            await api.patchAlert(alertId, { status: 'acknowledged' });
            setAlerts(prev => prev.filter(a => a.id !== alertId));
        } catch (_e) {
            toast.error("Alert acknowledgment failed");
        }
    };

    const ackAllAlerts = async () => {
        if (!alerts.length) return;
        try {
            const res = await api.acknowledgeAllAlerts({ house_id: houseId });
            setAlerts([]);
            toast.success(`Acknowledged ${res.count || alerts.length} alerts`);
        } catch (_e) {
            toast.error("Failed to acknowledge all alerts");
        }
    };

    const handleDeviceAction = async (type, state) => {
        const opId = "SYS";
        try {
            if (type === 'fan') {
                await api.patchFans(houseId, { speed_percent: state.running ? 0 : 50, operator_id: opId });
            } else if (type === 'heater') {
                await api.activateHeater(houseId, { active: !state.running && !state.active, operator_id: opId });
            } else if (type === 'feeder') {
                await api.triggerFeeder(houseId, { portion_kg: 5.0, operator_id: opId });
            } else if (type === 'lighting') {
                await api.patchLighting(houseId, { on: !state.on, brightness: state.on ? 0 : 100, operator_id: opId });
            }
        } catch (_e) {
            toast.error("Action failed");
        }
    };

    const renderWidget = (type, title, defaultControl) => {
        const control = controls?.[type] || defaultControl;
        const state = control.state || {};
        const isAiManaged = control.mode === 'auto' && control.updated_by === 'AI_SYSTEM';

        return (
            <div className="panel" style={{ padding: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border-dim)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="mono" style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '11px' }}>{title}</div>
                        {isAiManaged && (
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 8,
                            color: 'var(--ok)', background: 'var(--ok-glow)',
                            border: '1px solid rgba(13, 148, 136, 0.2)',
                            padding: '1px 6px', borderRadius: '4px',
                            letterSpacing: '0.05em', animation: 'pulse-dot 2s infinite',
                          }}>
                            AI managed
                          </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', backgroundColor: 'var(--bg-panel)', borderRadius: '6px', overflow: 'hidden', padding: '2px' }}>
                        {canEdit && (
                            <>
                                <button 
                                    className="mono" 
                                    style={{ background: control.mode === 'auto' ? 'var(--ok)' : 'transparent', color: control.mode === 'auto' ? '#fff' : 'var(--text-dim)', border: 'none', padding: '2px 8px', fontSize: '9px', cursor: 'pointer', borderRadius: '4px' }} 
                                    onClick={() => api.setHouseControlMode(houseId, type, { mode: "auto", operator_id: "SYS" })}
                                >
                                    Auto
                                </button>
                                <button 
                                    className="mono" 
                                    style={{ background: control.mode === 'manual' ? 'var(--warn)' : 'transparent', color: control.mode === 'manual' ? '#fff' : 'var(--text-dim)', border: 'none', padding: '2px 8px', fontSize: '9px', cursor: 'pointer', borderRadius: '4px' }} 
                                    onClick={() => setOverrideModal({ open: true, device: title, type: type })}
                                >
                                    Manual
                                </button>
                            </>
                        )}
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '8px', fontSize: '11px', marginBottom: '16px', alignItems: 'center' }}>
                    {type === 'fan' && (
                        <>
                            <span style={{ color: 'var(--text-dim)' }} className="mono">Speed</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input 
                                    type="range"
                                    min="0" max="100"
                                    value={state.speed_percent || 0}
                                    disabled={control.mode !== 'manual'}
                                    onChange={(e) => api.patchFans(houseId, { speed_percent: parseInt(e.target.value), operator_id: "SYS" })}
                                    style={{ 
                                        flex: 1, height: '4px', 
                                        accentColor: 'var(--info)',
                                        cursor: control.mode === 'manual' ? 'pointer' : 'not-allowed',
                                        opacity: control.mode === 'manual' ? 1 : 0.4
                                    }}
                                />
                                <span className="mono" style={{ fontSize: '10px', minWidth: '30px' }}>{state.speed_percent || 0}%</span>
                            </div>
                        </>
                    )}
                    <span style={{ color: 'var(--text-dim)' }} className="mono">Status</span>
                    <span className="mono" style={{ color: state.running || state.active || state.on ? 'var(--ok)' : 'var(--text-dim)', fontSize: '10px' }}>
                        {state.running || state.active || state.on ? 'Active' : 'Idle'}
                    </span>
                </div>
                {canEdit && (
                    <CommandButton
                        label={state.running || state.active || state.on ? 'Deactivate' : 'Activate'}
                        variant={state.running || state.active || state.on ? 'primary' : 'ghost'}
                        style={{ width: '100%', fontSize: '10px', height: '32px' }}
                        disabled={control.mode !== 'manual'}
                        onExecute={() => handleDeviceAction(type, state)}
                    />
                )}
            </div>
        );
    };

    const latestVal = telemetry[telemetry.length - 1] || {};

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px', minHeight: '100%', background: 'transparent' }}>
            
            {/* Header / Navigation */}
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                borderBottom: '1px solid var(--border-dim)', 
                paddingBottom: '20px',
                marginBottom: '10px'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <h1 style={{ margin: 0, fontSize: '30px', fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                        Operational command <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>// House {house?.house_code || houseId.slice(0, 8)}</span>
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ height: '6px', width: '6px', borderRadius: '50%', background: 'var(--ok)', boxShadow: '0 0 8px var(--ok)' }} />
                            <span className="mono" style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>Systems: nominal</span>
                        </div>
                        <div style={{ width: '1px', height: '10px', background: 'var(--border-dim)' }} />
                        <span className="mono" style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>Flock: {activeFlock?.flock_id || 'Unknown'}</span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <DemoScenario houseId={houseId} />
                <div style={{ display: 'flex', gap: '4px', padding: '4px', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-dim)' }}>
                    {[
                        { id: 'OPERATIONS', label: 'Operations', icon: '◈' },
                        { id: 'HEALTH', label: 'Health', icon: '♥' },
                        { id: 'INTELLIGENCE', label: 'AI', icon: '✦' },
                        { id: 'SPATIAL', label: 'Spatial', icon: '⚐' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: 'none',
                                fontFamily: 'var(--font-body)',
                                fontSize: '14px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                                background: activeTab === tab.id ? 'var(--action)' : 'transparent',
                                color: activeTab === tab.id ? 'var(--on-action)' : 'var(--text-secondary)',
                                boxShadow: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            <span style={{ fontSize: '12px', opacity: 0.8 }}>{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>
                </div>
            </div>

            {/* Tab 1: HEALTH */}
            {activeTab === 'HEALTH' && (
                <HealthDashboard 
                    house={house}
                    telemetry={houseSeries}
                    alerts={alerts}
                    activeFlock={activeFlock}
                    predictions={predictions}
                />
            )}

            {/* Tab 2: OPERATIONS */}
            {activeTab === 'OPERATIONS' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} className="fade-in">
                    
                    {/* Active Setpoints Strip */}
                    {todaySetpoints?.setpoints?.environmental && (
                        <div className="panel" style={{ padding: '12px 20px', display: 'flex', gap: 24, alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: 'var(--ok)', boxShadow: '0 0 8px var(--ok)',
                                    animation: 'pulse-dot 2s infinite'
                                }} />
                                <span className="mono" style={{ fontSize: 10, color: 'var(--text-primary)', letterSpacing: '0.1em' }}>
                                    TARGETS J{todaySetpoints.age_days}
                                </span>
                            </div>
                            <div style={{ width: 1, height: 20, background: 'var(--border-dim)' }} />
                            {[
                                { label: 'T°', value: todaySetpoints.setpoints.environmental.temperature_c, unit: '°C', color: 'var(--danger)' },
                                { label: 'Hygro', value: todaySetpoints.setpoints.environmental.humidity_pct, unit: '%', color: 'var(--info)' },
                                { label: 'Air', value: todaySetpoints.setpoints.environmental.air_requirement, unit: 'm³/h/kg', color: 'var(--ok)' },
                                { label: 'CO₂ max', value: todaySetpoints.setpoints.environmental.co2_ppm, unit: 'ppm', color: 'var(--text-dim)' },
                            ].map((s, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{s.label}</span>
                                    <span className="mono" style={{ fontSize: 14, color: s.color, fontWeight: 600 }}>{s.value?.toFixed(1)}</span>
                                    <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>{s.unit}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Metric Strip - Enhanced with Radial Gauges */}
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                        gap: '20px',
                        marginBottom: '10px'
                    }}>
                        {(() => {
                            const getStats = (key) => {
                                const vals = telemetry.map(t => t[key]).filter(v => v != null);
                                return {
                                    prev: telemetry.length > 1 ? telemetry[telemetry.length - 2][key] : latestVal[key],
                                    min: vals.length ? Math.min(...vals) : latestVal[key],
                                    max: vals.length ? Math.max(...vals) : latestVal[key]
                                };
                            };

                            const tStats = getStats('temperature');
                            const hStats = getStats('humidity');
                            const aStats = getStats('ammonia');
                            // Temperature-Humidity Index (heat stress), derived from the DHT22 readings:
                            // THI = 0.8·T + RH·(T − 14.4) + 46.4  (LWSI: < 75 normal, 75–79 alert, ≥ 79 danger)
                            const thiOf = (t) => (t?.temperature == null || t?.humidity == null) ? null
                                : 0.8 * t.temperature + (t.humidity / 100) * (t.temperature - 14.4) + 46.4;
                            const thiVals = telemetry.map(thiOf).filter(v => v != null);
                            const thi = thiOf(latestVal);
                            const thiPrev = telemetry.length > 1 ? thiOf(telemetry[telemetry.length - 2]) : thi;

                            return (
                                <>
                                    <RadialGauge 
                                        label="Temperature" 
                                        value={latestVal.temperature} 
                                        prevValue={tStats.prev}
                                        dailyMin={tStats.min}
                                        dailyMax={tStats.max}
                                        unit="°C" 
                                        min={10} max={45} 
                                        color="var(--danger)" 
                                        thresholds={{ warn: 32, danger: 35 }} 
                                    />
                                    <RadialGauge 
                                        label="Humidity" 
                                        value={latestVal.humidity} 
                                        prevValue={hStats.prev}
                                        dailyMin={hStats.min}
                                        dailyMax={hStats.max}
                                        unit="%" 
                                        min={20} max={100} 
                                        color="var(--info)" 
                                        thresholds={{ warn: 75, danger: 85 }} 
                                    />
                                    <RadialGauge 
                                        label="Ammonia" 
                                        value={latestVal.ammonia} 
                                        prevValue={aStats.prev}
                                        dailyMin={aStats.min}
                                        dailyMax={aStats.max}
                                        unit="ppm" 
                                        min={0} max={50} 
                                        color="var(--warn)" 
                                        thresholds={{ warn: 15, danger: 25 }} 
                                    />
                                    <RadialGauge 
                                        label="Heat stress (THI)" 
                                        value={thi} 
                                        prevValue={thiPrev}
                                        dailyMin={thiVals.length ? Math.min(...thiVals) : null}
                                        dailyMax={thiVals.length ? Math.max(...thiVals) : null}
                                        unit="index" 
                                        min={60} max={95} 
                                        color="var(--ok)" 
                                        thresholds={{ warn: 75, danger: 79 }} 
                                    />
                                </>
                            );
                        })()}
                    </div>

                    {/* Operational Layout: 70/30 Split */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7.2fr) minmax(0, 2.8fr)', gap: '24px', alignItems: 'start' }}>
                        {/* Primary Column */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '540px', overflow: 'hidden' }}>
                                <ErrorBoundary source="Telemetry">
                                    <div className="panel-header" style={{ background: 'linear-gradient(to right, rgba(255,255,255,0.03), transparent)' }}>
                                        <span className="panel-title">Telemetry hero browser</span>
                                        <span className="mono dim" style={{ fontSize: 9 }}>Real-time 60M window</span>
                                    </div>
                                    <div style={{ position: 'relative', flex: 1, minHeight: '400px', width: '100%', padding: '0 20px 20px 0' }}>
                                        <ResponsiveContainer width="100%" height="100%" minHeight={300} debounce={50}>
                                            <LineChart data={chartDataWithForecast || []} margin={{ top: 30, right: 30, left: 20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="4 4" stroke="var(--border-dim)" vertical={false} />
                                                <XAxis dataKey="time" stroke="var(--text-dim)" fontSize={10} fontFamily="var(--font-mono)" axisLine={false} tickLine={false} dy={10} />
                                                <YAxis yAxisId="left" stroke="var(--text-dim)" fontSize={10} fontFamily="var(--font-mono)" axisLine={false} tickLine={false} />
                                                <YAxis yAxisId="right" orientation="right" stroke="var(--text-dim)" fontSize={10} fontFamily="var(--font-mono)" axisLine={false} tickLine={false} />
                                                <RechartsTooltip 
                                                    contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-mid)', borderRadius: '12px', fontSize: 11, fontFamily: 'var(--font-mono)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
                                                />
                                                <Line yAxisId="left" type="monotone" dataKey="temperature" stroke="var(--danger)" dot={false} strokeWidth={3} isAnimationActive={false} />
                                                <Line yAxisId="left" type="monotone" dataKey="humidity" stroke="var(--info)" dot={false} strokeWidth={3} isAnimationActive={false} />
                                                <Line yAxisId="right" type="monotone" dataKey="ammonia" stroke="var(--warn)" dot={false} strokeWidth={3} isAnimationActive={false} />
                                                
                                                <Line yAxisId="left" type="monotone" dataKey="temp_forecast" stroke="var(--danger)" strokeDasharray="8 4" opacity={0.3} dot={false} isAnimationActive={false} />
                                                <Line yAxisId="left" type="monotone" dataKey="hum_forecast" stroke="var(--info)" strokeDasharray="8 4" opacity={0.3} dot={false} isAnimationActive={false} />
                                                <Line yAxisId="right" type="monotone" dataKey="nh3_forecast" stroke="var(--warn)" strokeDasharray="8 4" opacity={0.3} dot={false} isAnimationActive={false} />
                                                
                                                {(anomalies || []).map((a, i) => (
                                                    <ReferenceDot key={`anomaly-${i}`} yAxisId="left" x={formatTime(a.timestamp)} y={a.temperature} r={5} fill="var(--danger)" stroke="#fff" strokeWidth={2} />
                                                ))}
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </ErrorBoundary>
                            </div>

                            <ErrorBoundary source="Alerts">
                                {(() => {
                                    const hasCritical = alerts.some(a => a.severity === 'critical' || a.severity === 'danger');
                                    const highestSeverity = hasCritical ? 'danger' : (alerts.length > 0 ? 'warn' : null);
                                    
                                    return (
                                        <div className="panel" style={{ 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            minHeight: '260px',
                                            transition: 'box-shadow 0.4s ease',
                                            border: alerts.length > 0 ? `1px solid var(--${highestSeverity}-glow)` : '1px solid var(--border-dim)',
                                            boxShadow: alerts.length > 0 ? `0 0 40px var(--${highestSeverity}-glow)` : 'none'
                                        }}>
                                            <div className="panel-header" style={{ 
                                                background: alerts.length > 0 
                                                    ? `linear-gradient(to right, var(--${highestSeverity}-glow), transparent)` 
                                                    : 'linear-gradient(to right, rgba(255,255,255,0.02), transparent)',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '4px 16px'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <span className="panel-title" style={{ 
                                                        color: alerts.length > 0 ? `var(--${highestSeverity})` : 'inherit',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px'
                                                    }}>
                                                        {alerts.length > 0 && <span style={{ animation: 'pulse-dot 1.5s infinite' }}>🚨</span>}
                                                        ACTIVE INCIDENTS
                                                        {alerts.length > 0 && (
                                                            <span style={{ 
                                                                fontSize: '10px', 
                                                                background: `var(--${highestSeverity})`, 
                                                                color: '#fff', 
                                                                padding: '1px 6px', 
                                                                borderRadius: '10px',
                                                                marginLeft: '4px',
                                                                fontFamily: 'var(--font-mono)'
                                                            }}>
                                                                {alerts.length}
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                                
                                                {alerts.length > 1 && (
                                                    <button 
                                                        className="mono"
                                                        onClick={ackAllAlerts}
                                                        style={{
                                                            fontSize: '9px',
                                                            background: 'rgba(255,255,255,0.05)',
                                                            border: '1px solid var(--border-dim)',
                                                            color: 'var(--text-dim)',
                                                            padding: '4px 10px',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            letterSpacing: '0.05em',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onMouseOver={(e) => { e.target.style.background = 'var(--info)'; e.target.style.color = '#fff'; }}
                                                        onMouseOut={(e) => { e.target.style.background = 'rgba(255,255,255,0.05)'; e.target.style.color = 'var(--text-dim)'; }}
                                                    >
                                                        Acknowledge all
                                                    </button>
                                                )}
                                            </div>
                                            
                                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                                {alerts.length === 0 ? (
                                                    <div style={{ padding: '60px 40px', textAlign: 'center' }} className="fade-in">
                                                        <div style={{ 
                                                            fontSize: '32px', 
                                                            marginBottom: '16px', 
                                                            color: 'var(--ok)',
                                                            filter: 'drop-shadow(0 0 10px var(--ok-glow))' 
                                                        }}>
                                                            ✓
                                                        </div>
                                                        <div className="mono" style={{ fontSize: '11px', color: 'var(--ok)', letterSpacing: '0.15em', fontWeight: 600 }}>
                                                            System nominal
                                                        </div>
                                                        <div className="mono" style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '4px', opacity: 0.6 }}>
                                                            No active threshold violations
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1px', background: 'var(--border-dim)' }}>
                                                        {alerts.map((a, i) => {
                                                            const isCritical = a.severity === 'critical' || a.severity === 'danger';
                                                            const color = isCritical ? 'var(--danger)' : 'var(--warn)';
                                                            const glow = isCritical ? 'var(--danger-glow)' : 'var(--warn-glow)';
                                                            
                                                            return (
                                                                <div key={a.id || `alert-${i}`} style={{ 
                                                                    padding: '20px', 
                                                                    background: isCritical ? `linear-gradient(135deg, var(--bg-panel), ${glow})` : 'var(--bg-panel)', 
                                                                    borderLeft: `4px solid ${color}`, 
                                                                    transition: 'all 0.2s',
                                                                    position: 'relative',
                                                                    overflow: 'hidden'
                                                                }}>
                                                                    {isCritical && (
                                                                        <div style={{ 
                                                                            position: 'absolute', top: 0, right: 0, 
                                                                            width: '60px', height: '60px', 
                                                                            background: 'linear-gradient(225deg, rgba(232,58,32,0.1), transparent)',
                                                                            display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                                                                            padding: '8px', fontSize: '16px'
                                                                        }}>
                                                                            ⚠️
                                                                        </div>
                                                                    )}
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                                                        <span className="mono" style={{ color: color, fontWeight: 700, fontSize: '12px', letterSpacing: '0.05em' }}>
                                                                            {sentence(a.metric)} breach
                                                                        </span>
                                                                        <span className="mono dim" style={{ fontSize: 9, opacity: 0.6 }}>{formatTime(a.timestamp)}</span>
                                                                    </div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: 16 }}>
                                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                            <span className="mono dim" style={{ fontSize: 8 }}>Reading</span>
                                                                            <span className="mono" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{a.value?.toFixed(2)}</span>
                                                                        </div>
                                                                        <div style={{ width: '1px', height: '24px', background: 'var(--border-dim)' }} />
                                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                            <span className="mono dim" style={{ fontSize: 8 }}>Limit</span>
                                                                            <span className="mono" style={{ fontSize: 18, fontWeight: 400, color: 'var(--text-dim)' }}>{a.threshold?.toFixed(1)}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                                        <CommandButton 
                                                                            label="Acknowledge" 
                                                                            variant={isCritical ? 'primary' : 'ghost'} 
                                                                            style={{ fontSize: 9, padding: '6px 16px', borderRadius: '4px' }} 
                                                                            onExecute={() => ackAlert(a.id)} 
                                                                        />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </ErrorBoundary>
                        </div>

                        {/* Control Column */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <ErrorBoundary source="Controls">
                                <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div className="panel-header"><span className="panel-title">Operational commands</span></div>
                                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {renderWidget('fan', 'Fan array', { mode: 'auto', state: { speed: 0, running: false } })}
                                        {renderWidget('heater', 'Core heating', { mode: 'auto', state: { running: false } })}
                                        {renderWidget('feeder', 'Feed system', { mode: 'auto', state: { running: false } })}
                                    </div>
                                </div>
                            </ErrorBoundary>

                            <ErrorBoundary source="AIActions">
                                <AIActionLog houseId={houseId} activeAlerts={alerts} />
                            </ErrorBoundary>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 2: INTELLIGENCE */}
            {activeTab === 'INTELLIGENCE' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} className="fade-in">
                    <ErrorBoundary source="Predictions">
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '24px', alignItems: 'start' }}>
                            <PredictionPanel houseId={houseId} />
                            <div style={{ minHeight: '400px' }}>
                                <AIActionHistory houseId={houseId} />
                            </div>
                        </div>
                    </ErrorBoundary>
                </div>
            )}

            {/* Tab 3: SPATIAL */}
            {activeTab === 'SPATIAL' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} className="fade-in">
                    <FloorPlanView
                        house={house}
                        sensors={sensors}
                        actuators={actuators} 
                        houseId={houseId} 
                        onUpdateDevice={async (id, data) => {
                            await api.patchDevice(id, data);
                            // Local state update for immediate feedback (though refresh will handle it)
                            toast.success("Spatial position calibrated");
                        }}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '24px' }}>
                        <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
                            <div className="panel-header"><span className="panel-title">Sensor infrastructure</span></div>
                            <SensorGrid sensors={sensors} loading={devicesLoading} />
                        </div>
                        <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
                            <div className="panel-header"><span className="panel-title">Actuator infrastructure</span></div>
                            <ActuatorGrid actuators={actuators} loading={devicesLoading} />
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={overrideModal.open}
                title={`MANUAL OVERRIDE: ${overrideModal.device}`}
                description={`Taking manual control of ${overrideModal.device} will suspend AI optimization for this device.`}
                confirmLabel="Confirm override"
                requireReason={true}
                reasons={['Maintenance / Cleaning', 'Equipment Malfunction', 'Sensor Calibration', 'Safety / Emergency', 'Veterinary Check', 'Other']}
                onConfirm={confirmOverride}
                onCancel={() => setOverrideModal({ open: false, device: null, type: null })}
            />
        </div>
    );
}
