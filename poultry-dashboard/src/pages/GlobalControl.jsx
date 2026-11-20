import React, { useState, useEffect } from 'react';
import { api } from '../lib/Api';
import CommandButton from '../components/CommandButton';
import ConfirmModal from '../components/ConfirmModal';
import RoleLock from '../components/RoleLock';
import StatusBadge from '../components/StatusBadge';
import { sentence } from '../lib/format';


export default function GlobalControl() {
    const [summary, setSummary] = useState({});
    const [farms, setFarms] = useState([]);
    const [scheduled, setScheduled] = useState([]);
    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState(null);
    const [batchCommand, setBatchCommand] = useState('fan_speed');
    const [batchValue, setBatchValue] = useState(100);
    const [batchModalOpen, setBatchModalOpen] = useState(false);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [sumRes, farmsRes, schedRes] = await Promise.all([
                    api.getControlSummary(),
                    api.getFarms(),
                    api.getScheduledCommands()
                ]);
                setSummary(sumRes || {});
                setFarms(farmsRes || []);
                if (farmsRes?.length > 0) setActiveTab(farmsRes[0].id);
                setScheduled(schedRes || []);
            } catch (err) {
                console.error("Failed to load global control data", err);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    const executeBatch = async () => {
        // Collect house IDs for active farm
        const houseIds = Object.keys(summary[activeTab] || {});

        await api.executeBatch({
            house_ids: houseIds,
            command: batchCommand,
            value: Number(batchValue),
            operator_id: "SYS"
        });
        setBatchModalOpen(false);
    };

    const cancelScheduled = async (id) => {
        await api.deleteScheduledCommand(id);
        setScheduled(prev => prev.filter(s => s.id !== id));
    };

    if (loading) return <div style={{ padding: '40px', color: 'var(--text-secondary)' }}>Loading control matrix...</div>;

    const activeFarmHouses = summary[activeTab] || {};

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-dim)', paddingBottom: '0px' }}>
                {farms.map(f => (
                    <button
                        key={f.id}
                        onClick={() => setActiveTab(f.id)}
                        style={{
                            padding: '12px 24px',
                            backgroundColor: activeTab === f.id ? 'var(--bg-panel)' : 'transparent',
                            border: '1px solid var(--border-dim)',
                            borderBottom: activeTab === f.id ? '2px solid var(--accent)' : '1px solid transparent',
                            color: activeTab === f.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontFamily: 'var(--font-display)',
                            fontSize: '14px',
                            cursor: 'pointer',
                            borderRadius: 'var(--radius) var(--radius) 0 0',
                            letterSpacing: '0.05em'
                        }}
                    >
                        {sentence(f.name)}
                    </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 1fr)', gap: '20px', alignItems: 'start' }}>

                {/* Fast Action Board */}
                <div className="panel" style={{ padding: '20px' }}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--text-primary)', marginBottom: '16px' }}>Fast action matrix</h2>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                        {Object.entries(activeFarmHouses).map(([houseId, data]) => (
                            <div key={houseId} style={{ border: '1px solid var(--border-dim)', padding: '12px', borderRadius: 'var(--radius)', backgroundColor: 'var(--bg-surface)' }}>
                                <div className="mono-text" style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '12px' }}>
                                    {data.house_code || houseId.split('-')[0]}
                                </div>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                    <CommandButton
                                        label="Fan max"
                                        variant="ghost"
                                        style={{ flex: 1, minWidth: '80px', fontSize: '10px' }}
                                        onExecute={() => api.patchFans(houseId, { speed_percent: 100, operator_id: 'SYS' })}
                                    />
                                    <CommandButton
                                        label="Heat on"
                                        variant="ghost"
                                        style={{ flex: 1, minWidth: '80px', fontSize: '10px' }}
                                        onExecute={() => api.activateHeater(houseId, { active: true, operator_id: 'SYS' })}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Batch Panel */}
                <RoleLock requires="supervisor">
                    <div className="panel" style={{ padding: '20px', borderTop: '2px solid var(--warn)' }}>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--warn)', marginBottom: '8px' }}>Batch execution</h2>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
                            Applies immediate control overrides to all active houses in the selected farm.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                            <select
                                value={batchCommand}
                                onChange={e => setBatchCommand(e.target.value)}
                                style={{ width: '100%', padding: '8px' }}
                            >
                                <option value="fan_speed">Set Ventilation Speed</option>
                                <option value="heater_toggle">Toggle Heaters</option>
                                <option value="feeder_toggle">Toggle Feeders</option>
                            </select>

                            {batchCommand === 'fan_speed' && (
                                <input
                                    type="number"
                                    min="0" max="100"
                                    value={batchValue}
                                    onChange={e => setBatchValue(e.target.value)}
                                    placeholder="Speed %"
                                />
                            )}
                        </div>

                        <button
                            className="btn btn-primary"
                            style={{ width: '100%' }}
                            onClick={() => setBatchModalOpen(true)}
                        >
                            Preview batch
                        </button>
                    </div>
                </RoleLock>
            </div>

            {/* Scheduled Commands */}
            <div className="panel" style={{ marginTop: '10px' }}>
                <div className="panel-header">
                    <span className="panel-title">Scheduled commands queue</span>
                </div>
                <div style={{ padding: '12px', overflowY: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Target</th>
                                <th>Command</th>
                                <th>Execution time</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {scheduled.length === 0 ? (
                                <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No commands scheduled</td></tr>
                            ) : scheduled.map(cmd => (
                                <tr key={cmd.id}>
                                    <td className="mono-text" style={{ fontWeight: 600 }}>{cmd.target_type} : {cmd.target_id || 'ALL'}</td>
                                    <td>{cmd.command}</td>
                                    <td className="mono-text">{new Date(cmd.scheduled_time || Date.now()).toLocaleString()}</td>
                                    <td><StatusBadge label={cmd.status || 'Pending'} status={cmd.status === 'executed' ? 'ok' : 'info'} /></td>
                                    <td>
                                        <CommandButton label="Cancel" variant="danger" onExecute={() => cancelScheduled(cmd.id)} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <ConfirmModal
                isOpen={batchModalOpen}
                title="Confirm batch execution"
                description={`This action will override systems across ${Object.keys(activeFarmHouses).length} houses in ${farms.find(f => f.id === activeTab)?.name}.`}
                confirmLabel="Execute batch"
                requireReason={true}
                reasons={["Ventilation Cycle", "Temperature Correction", "Emergency Override"]}
                onConfirm={executeBatch}
                onCancel={() => setBatchModalOpen(false)}
            />
        </div>
    );
}
