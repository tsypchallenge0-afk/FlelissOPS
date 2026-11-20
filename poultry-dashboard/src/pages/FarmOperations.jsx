import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/Api';
import { toast } from 'sonner';
import StatusBadge from '../components/StatusBadge';
import ConfirmModal from '../components/ConfirmModal';
import CommandButton from '../components/CommandButton';
import RoleLock from '../components/RoleLock';
import { useWSSubscribe } from '../context/WSContext';
import { sentence } from '../lib/format';


export default function FarmOperations() {
    const { farmId } = useParams();
    const navigate = useNavigate();

    const [farm, setFarm] = useState(null);
    const [houses, setHouses] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [workOrders, setWorkOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
    const [actionError, setActionError] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [farmData, housesRes, alertsRes, workRes] = await Promise.all([
                    api.getFarm(farmId).catch(async () => {
                        const allFarms = await api.getFarms();
                        const match = allFarms.find((f) => String(f.id) === String(farmId));
                        if (!match) throw new Error("Farm not found");
                        return match;
                    }),
                    api.getFarmHouses(farmId).catch(() => []),
                    api.getFarmAlerts(farmId, { status: 'active' }).catch(async () => {
                        const all = await api.getAlerts({ status: 'active' });
                        return all.filter(a => String(a.farm_id || a.farmId) === String(farmId));
                    }),
                    api.getWorkOrders({ farmId, status: 'open' }).catch(() => [])
                ]);
                setFarm(farmData);
                setHouses(housesRes);
                setAlerts(alertsRes);
                setWorkOrders(workRes);
            } catch (err) {
                console.error("Failed to load farm operations", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [farmId]);

    useWSSubscribe('telemetry', (msg) => {
        const point = msg.data || msg;
        setHouses(prev => prev.map(h => {
            if (h.id === point.house_id) {
                return { ...h, metrics: { temp: point.temperature, humidity: point.humidity, ammonia: point.ammonia } };
            }
            return h;
        }));
    });

    const triggerEmergencyCooling = async (reason) => {
        try {
            setActionError('');
            await api.executeBatch({
                house_ids: houses.map(h => h.id),
                command: "EMERGENCY_COOLING",
                value: { fan_speed: 100 },
                operator_id: "SYS",
                reason: reason || "Emergency Override",
            });
            toast.warning(`Farm ${farm.name} emergency cooling engaged!`);
            setEmergencyModalOpen(false);
        } catch (err) {
            const status = err?.response?.status;
            if (status === 403) {
                setActionError('Forbidden: your account cannot send farm-wide emergency commands.');
                return;
            }
            setActionError('Failed to execute emergency cooling. Please retry.');
            throw err;
        }
    };

    if (loading || !farm) return <div style={{ padding: '40px', color: 'var(--text-secondary)' }}>Loading farm...</div>;

    const getAlertsForHouse = (hId) => alerts.filter(a => a.house_id === hId || a.houseId === hId).length;

    return (
        <div style={{ display: 'flex', gap: '20px', height: '100%' }}>

            {/* Main Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Farm Header */}
                <div className="panel" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', margin: 0 }}>{farm.name}</h1>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            {farm.location} · {houses.length} Active Houses
                        </div>
                    </div>
                    <button className="btn btn-ghost">Farm settings</button>
                </div>

                {/* Houses Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                    {houses.map(house => {
                        const hAlerts = getAlertsForHouse(house.id);
                        const risk = house.riskLevel || house.risk_level || 'ok';
                        return (
                            <div
                                key={house.id}
                                className="panel fade-in"
                                style={{
                                    cursor: 'pointer',
                                    borderColor: risk === 'danger' ? 'var(--danger)' : risk === 'warn' ? 'var(--warn)' : 'var(--ok)',
                                    boxShadow: risk !== 'ok' ? `0 0 10px var(--${risk}-glow)` : 'none'
                                }}
                                onClick={() => navigate(`/app/farms/${farmId}/houses/${house.id}`)}
                            >
                                <div className="panel-header" style={{ borderBottomColor: `var(--${risk})`, backgroundColor: `var(--${risk}-glow)` }}>
                                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: `var(--${risk})` }}>
                                        {house.house_code || house.name || `HOUSE ${house.id.slice(0, 4)}`}
                                    </span>
                                    {hAlerts > 0 && (
                                        <div style={{ backgroundColor: 'var(--danger)', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>
                                            {hAlerts} alerts
                                        </div>
                                    )}
                                </div>

                                <div style={{ padding: '16px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: 'var(--bg-surface)', padding: '8px', borderRadius: 'var(--radius)' }}>
                                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Temp</span>
                                            <span className="mono-text" style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{(house.metrics?.temp || 0).toFixed(1)}°C</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: 'var(--bg-surface)', padding: '8px', borderRadius: 'var(--radius)' }}>
                                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Hum</span>
                                            <span className="mono-text" style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{(house.metrics?.humidity || 0).toFixed(1)}%</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: 'var(--bg-surface)', padding: '8px', borderRadius: 'var(--radius)' }}>
                                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>NH3</span>
                                            <span className="mono-text" style={{ fontSize: '14px', color: (house.metrics?.ammonia || 0) > 15 ? 'var(--danger)' : 'var(--text-primary)' }}>{(house.metrics?.ammonia || 0).toFixed(1)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Work Orders Strip */}
                {workOrders.length > 0 && (
                    <div className="panel" style={{ padding: '16px' }}>
                        <h3 style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '12px' }}>Open Work Orders</h3>
                        <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
                            {workOrders.map(wo => (
                                <div key={wo.id} style={{ minWidth: '260px', padding: '12px', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius)', backgroundColor: 'var(--bg-surface)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span className="mono-text" style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{wo.id.split('-')[0]}</span>
                                        <span style={{ fontSize: '10px', color: wo.priority === 'critical' ? 'var(--danger)' : 'var(--warn)', fontWeight: 'bold' }}>{sentence(wo.priority)}</span>
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>{wo.description}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Assigned: {wo.assigned_to || wo.assignedTo}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Control Sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '280px', flexShrink: 0 }}>
                <div className="panel">
                    <div className="panel-header" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                        <span className="panel-title">Farm-wide controls</span>
                    </div>
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Master Ventilation Mode</label>
                            <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius)', padding: 2 }}>
                                <button className="btn" style={{ flex: 1, backgroundColor: 'var(--ok)', color: 'white' }}>Auto</button>
                                <button className="btn btn-ghost" style={{ flex: 1, border: 'none' }}>Manual</button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Feed Program</label>
                            <select defaultValue="Standard">
                                <option>Standard Growth</option>
                                <option>Accelerated Growth</option>
                                <option>Pre-slaughter Maintenance</option>
                            </select>
                        </div>

                        <div style={{ borderTop: '1px solid var(--border-dim)', paddingTop: '20px' }}>
                            <RoleLock requires="supervisor" tooltip="Requires supervisor access">
                                <button className="btn btn-danger" style={{ width: '100%' }} onClick={() => setEmergencyModalOpen(true)}>
                                    ⚠ EMERGENCY COOLING
                                </button>
                            </RoleLock>
                            {actionError ? (
                                <div className="mono-text" style={{ marginTop: '10px', fontSize: '11px', color: 'var(--danger)' }}>
                                    {actionError}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={emergencyModalOpen}
                title="Initiate emergency cooling"
                description="This will override ALL house controls in this farm and blast fans to 100%. Ensure no personnel are inside."
                confirmLabel="Confirm override"
                confirmVariant="danger"
                requireReason={true}
                reasons={["Critical Heat Stress", "Sensor Failure Override", "Ventilation Drill", "Other"]}
                onConfirm={triggerEmergencyCooling}
                onCancel={() => setEmergencyModalOpen(false)}
            />
        </div>
    );
}
