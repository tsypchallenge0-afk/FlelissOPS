import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/Api';
import StatusBadge from '../components/StatusBadge';
import { useWSSubscribe } from '../context/WSContext';
import Skeleton from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import RegistrationDrawer from '../components/RegistrationDrawer';
import RoleLock from '../components/RoleLock';
import { useAuth } from '../context/AuthContext';
import { sentence } from '../lib/format';

const BASE = 'http://127.0.0.1:9000';

export default function CommandCenter() {
    const navigate = useNavigate();
    const { user: __unused_user } = useAuth(); // keep hook call if needed for effect, or omit
    const [farms, setFarms] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [devices, setDevices] = useState([]);

    const fetchFarms = useCallback(async () => {
        try {
            const data = await api.getFarms();
            setFarms(data);
        } catch (err) {
            console.error("Failed to fetch farms", err);
        }
    }, []);

    const fetchAlerts = useCallback(async () => {
        try {
            const data = await api.getAlerts({ status: 'active' });
            setAlerts(data);
        } catch (err) {
            console.error("Failed to fetch alerts", err);
        }
    }, []);

    const fetchDevices = useCallback(async () => {
        try {
            setDevices(await api.getDevices());
        } catch (err) {
            console.error("Failed to fetch devices", err);
        }
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            await Promise.all([fetchFarms(), fetchAlerts(), fetchDevices()]);
            setLoading(false);
        };
        fetchData();
    }, [fetchFarms, fetchAlerts, fetchDevices]);

    // Devices that reported in the last 15 minutes (timestamps are UTC, often without a 'Z')
    const ONLINE_WINDOW_MS = 15 * 60 * 1000;
    const devicesOnline = devices.filter(d => {
        if (!d.last_seen) return false;
        const s = String(d.last_seen);
        const t = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`).getTime();
        return Date.now() - t < ONLINE_WINDOW_MS;
    }).length;

    const handleRegistered = useCallback(() => {
        fetchFarms();
    }, [fetchFarms]);

    useWSSubscribe('alert', (msg) => {
        const newAlerts = msg.alerts || [msg];
        setAlerts(prev => [...newAlerts, ...prev].slice(0, 50));
    });

    useWSSubscribe('telemetry', () => {
        // Option to dynamically update farm cards if needed
    });

    const totalFarms = farms.length;
    const activeAlertsCount = alerts.length;
    const totalHouses = farms.reduce((sum, f) => sum + (f.houseCount || f.house_count || 0), 0);

    // Safely mapping backend keys which might use snake_case
    const getRiskLevel = (f) => f.riskLevel || f.risk_level || 'ok';
    const riskStatus = (f) => ({ high: 'danger', medium: 'warn', low: 'ok' }[String(getRiskLevel(f)).toLowerCase()] || getRiskLevel(f));
    const getName = (f) => f.name || 'Unnamed Farm';
    const getLocation = (f) => f.location || 'Unknown Location';
    const getActiveAlertsCount = (f) => f.active_alert_count || f.activeAlerts || f.active_alerts || 0;
    // null = no reading in the last hour (shown as "—", never as a fake 0)
    const getMetrics = (f) => ({
        tempMin: f.temp_min ?? f.metrics?.temp_min ?? null,
        tempMax: f.temp_max ?? f.metrics?.temp_max ?? null,
        humidityMin: f.humidity_min ?? f.metrics?.humidity_min ?? null,
        humidityMax: f.humidity_max ?? f.metrics?.humidity_max ?? null,
        ammoniaPeak: f.ammonia_peak ?? f.metrics?.ammonia_peak ?? null,
    });
    const range = (a, b, digits, unit) => (a == null || b == null) ? '—' : `${a.toFixed(digits)} - ${b.toFixed(digits)} ${unit}`;
    const one = (v, digits, unit) => (v == null ? '—' : `${v.toFixed(digits)} ${unit}`);

    if (loading) {
        return (
            <div style={{ padding: '40px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="panel" style={{ padding: 16 }}>
                        <Skeleton height={14} width="60%" style={{ marginBottom: 10 }} />
                        <Skeleton height={28} width="40%" style={{ marginBottom: 12 }} />
                        <Skeleton height={10} width="90%" style={{ marginBottom: 6 }} />
                        <Skeleton height={10} width="75%" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div>
                    <div className="page-title">Command Center</div>
                    <div className="page-subtitle">
                        Enterprise overview · {farms.length} farms monitored
                    </div>
                </div>

                <RoleLock requires="operator">
                    <button
                        onClick={() => setDrawerOpen(true)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 16px',
                            fontFamily: 'var(--font-body)',
                            fontSize: 14,
                            fontWeight: 600,
                            border: '1px solid var(--action)',
                            backgroundColor: 'var(--action)',
                            color: 'var(--on-action)',
                            cursor: 'pointer',
                            borderRadius: '10px',
                            minHeight: 40,
                            transition: 'background-color 0.15s',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.backgroundColor = 'var(--action-hover)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.backgroundColor = 'var(--action)';
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Register
                    </button>
                </RoleLock>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                {[
                    { label: 'Farms online', value: `${totalFarms}`, status: totalFarms > 0 ? 'ok' : 'danger' },
                    { label: 'Total houses', value: totalHouses, status: 'info' },
                    { label: 'Active alerts', value: activeAlertsCount, status: activeAlertsCount > 5 ? 'danger' : activeAlertsCount > 0 ? 'warn' : 'ok' },
                    { label: 'Devices online', value: `${devicesOnline}/${devices.length}`,
                      status: !devices.length ? 'info' : devicesOnline === devices.length ? 'ok' : devicesOnline > 0 ? 'warn' : 'danger' }
                ].map(kpi => (
                    <div key={kpi.label} className="panel" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginBottom: '6px' }}>{kpi.label}</div>
                            <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{kpi.value}</div>
                        </div>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: `var(--${kpi.status})` }} />
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                {farms.length === 0 && !loading && (
                    <div style={{ gridColumn: '1 / -1' }}>
                        <EmptyState
                            icon="device"
                            title="No farms registered"
                            subtitle="Add a farm via the admin panel to get started"
                        />
                    </div>
                )}
                {farms.map(farm => (
                    <div
                        key={farm.id}
                        className="panel fade-in"
                        style={{
                            cursor: 'pointer',
                            borderColor: 'var(--border-dim)',
                            transition: 'transform 0.2s',
                        }}
                        onClick={() => navigate(`/app/farms/${farm.id}`)}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                        <div className="panel-header">
                            <div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)' }}>{getName(farm)}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{getLocation(farm)} · {farm.house_count || farm.houseCount || 0} houses</div>
                            </div>
                            <StatusBadge
                                label={sentence(getRiskLevel(farm))}
                                status={riskStatus(farm)}
                            />
                        </div>

                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Temp spread</span>
                                <span className="mono-text" style={{ color: getMetrics(farm).tempMax > 32 ? 'var(--warn)' : 'var(--text-primary)' }}>
                                    {range(getMetrics(farm).tempMin, getMetrics(farm).tempMax, 1, '°C')}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Humidity spread</span>
                                <span className="mono-text" style={{ color: 'var(--text-primary)' }}>
                                    {range(getMetrics(farm).humidityMin, getMetrics(farm).humidityMax, 0, '%')}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Peak ammonia</span>
                                <span className="mono-text" style={{ color: getMetrics(farm).ammoniaPeak > 20 ? 'var(--danger)' : 'var(--text-primary)' }}>
                                    {one(getMetrics(farm).ammoniaPeak, 1, 'ppm')}
                                </span>
                            </div>
                        </div>

                        <div style={{ padding: '12px', borderTop: '1px solid var(--border-dim)', backgroundColor: 'var(--bg-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            {getActiveAlertsCount(farm) > 0 ? (
                                <div style={{ color: 'var(--danger)', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <div style={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: 'var(--danger)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>{getActiveAlertsCount(farm)}</div>
                                    Alerts
                                </div>
                            ) : (
                                <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>No active alerts</span>
                            )}
                            <button className="btn btn-ghost" style={{ fontSize: '13px', padding: '4px 12px', minHeight: 32 }}>View farm →</button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="panel" style={{ marginTop: '10px' }}>
                <div className="panel-header">
                    <span className="panel-title">Global fleet heatmap</span>
                </div>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Farm ID</th>
                            <th>Temp spread</th>
                            <th>Hum spread</th>
                            <th>Peak NH3</th>
                            <th>Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {farms.map(f => (
                            <tr key={f.id}>
                                <td style={{ fontWeight: 600 }}>{getName(f)}</td>
                                <td className="mono-text" style={{ backgroundColor: getMetrics(f).tempMax > 32 ? 'var(--warn-glow)' : 'transparent' }}>
                                    {range(getMetrics(f).tempMin, getMetrics(f).tempMax, 1, '°C')}
                                </td>
                                <td className="mono-text">
                                    {range(getMetrics(f).humidityMin, getMetrics(f).humidityMax, 0, '%')}
                                </td>
                                <td className="mono-text" style={{ backgroundColor: getMetrics(f).ammoniaPeak > 20 ? 'var(--danger-glow)' : 'transparent' }}>
                                    {one(getMetrics(f).ammoniaPeak, 1, 'ppm')}
                                </td>
                                <td><StatusBadge label={sentence(getRiskLevel(f))} status={riskStatus(f)} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{
                position: 'fixed',
                bottom: 0,
                left: 'var(--sidebar-width)',
                right: 0,
                height: '32px',
                backgroundColor: 'var(--bg-panel)',
                borderTop: '1px solid var(--border-dim)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                zIndex: 50
            }}>
                <div style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--danger)',
                    paddingRight: '16px',
                    borderRight: '1px solid var(--border-dim)',
                    marginRight: '16px',
                    zIndex: 2,
                    backgroundColor: 'var(--bg-panel)'
                }}>Live alerts</div>
                {alerts.length > 0 ? (
                    <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                        <div style={{
                            display: 'inline-block',
                            animation: 'scroll-left 25s linear infinite',
                            whiteSpace: 'nowrap',
                            willChange: 'transform'
                        }} className="mono-text">
                            {alerts.slice(0, 5).map((a, i) => (
                                <span key={a.id || i} style={{
                                    marginRight: '40px',
                                    color: a.severity === 'danger' ? 'var(--danger)' : 'var(--warn)',
                                    fontSize: '12px'
                                }}>
                                    [{a.farm_id || a.farmId}] · [{a.house_code || a.house_id || a.houseId}] · {sentence((a.metric || ''))} = {a.value} · {a.message}
                                </span>
                            ))}
                        </div>
                    </div>
                ) : (
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>All systems normal</span>
                )}
            </div>
            <RegistrationDrawer
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                onRegistered={handleRegistered}
                farms={farms}
            />
        </div>
    );
}

