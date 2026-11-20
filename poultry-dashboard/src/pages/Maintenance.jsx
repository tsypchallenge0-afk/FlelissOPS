import React, { useState, useEffect } from 'react';
import { api } from '../lib/Api';
import EmptyState from '../components/EmptyState';
import { DndContext, closestCorners, useSensor, useSensors, PointerSensor, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAuth, useRole } from '../context/AuthContext';
import { sentence } from '../lib/format';

const COLUMNS = ['open', 'in_progress', 'blocked', 'resolved'];
const COLUMN_NAMES = { 'open': 'OPEN', 'in_progress': 'In progress', 'blocked': 'Blocked', 'resolved': 'Resolved' };

const woSchema = z.object({
    farm_id: z.string().min(1, "Farm is required"),
    house_id: z.string().min(1, "House is required"),
    category: z.string().min(1, "Category is required"),
    description: z.string().min(5, "Description is too short"),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    assigned_to: z.string().optional()
});

function SortableItem({ id, order }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
    const style = { transform: CSS.Transform.toString(transform), transition, marginBottom: '8px' };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <div className="panel" style={{ padding: '12px', backgroundColor: 'var(--bg-surface)', cursor: 'grab', borderLeft: `3px solid ${order.priority === 'critical' ? 'var(--danger)' : order.priority === 'high' ? 'var(--warn)' : 'var(--info)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span className="mono-text" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{order.id.split('-')[0]}</span>
                    <span className="mono-text" style={{ fontSize: '10px', fontWeight: 'bold' }}>{sentence(order.priority)}</span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '8px', lineHeight: 1.4 }}>
                    {order.description}
                </div>
                <div className="mono-text" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    {order.farm_name || order.farm_id} {order.house_code ? `· ${order.house_code}` : ''}
                </div>
            </div>
        </div>
    );
}

function DroppableColumn({ id, COLUMN_NAMES, orders }) {
    const { setNodeRef } = useDroppable({ id });
    const colItems = orders.filter(o => o.status === id);

    return (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-void)', border: 'none' }}>
            <div style={{ padding: '12px 0', borderBottom: '2px solid var(--border-dim)', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>{COLUMN_NAMES[id]}</span>
                <span style={{ backgroundColor: 'var(--bg-panel)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', color: 'var(--text-dim)' }}>{colItems.length}</span>
            </div>
            <div ref={setNodeRef} style={{ flex: 1, overflowY: 'auto', minHeight: '100px' }}>
                {colItems.length === 0 && (
                    <EmptyState
                        icon="check"
                        title="No work orders"
                        subtitle={`Nothing in ${COLUMN_NAMES[id].toLowerCase()}`}
                    />
                )}
                <SortableContext items={colItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    {colItems.map(o => <SortableItem key={o.id} id={o.id} order={o} />)}
                </SortableContext>
            </div>
        </div>
    );
}

export default function Maintenance() {
    const { user } = useAuth();
    const [orders, setOrders] = useState([]);
    const [farms, setFarms] = useState([]);
    const [houses, setHouses] = useState([]); 
    const [loading, setLoading] = useState(true);
    const [createMode, setCreateMode] = useState(false);

    const role = useRole();
    const canEdit = role === 'admin' || role === 'supervisor';

    const { register, handleSubmit, formState: { errors }, reset, watch } = useForm({
        resolver: zodResolver(woSchema),
        defaultValues: { priority: 'medium' }
    });

    const selectedFarm = watch('farm_id');

    useEffect(() => {
        if (selectedFarm) {
            api.getFarmHouses(selectedFarm).then(setHouses).catch(console.error);
        } else {
            setHouses([]);
        }
    }, [selectedFarm]);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    const fetchAll = async () => {
        try {
            const [woRes, fRes] = await Promise.all([
                api.getWorkOrders(),
                api.getFarms()
            ]);
            setOrders(woRes || []);
            setFarms(fRes || []);
        } catch {
            console.error("error fetching");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAll(); }, []);

    const onDragEnd = async (event) => {
        if (!canEdit) {
            toast.error("Insufficient permissions to move work orders");
            return;
        }
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id;
        const overId = over.id; 

        const activeIndex = orders.findIndex(o => o.id === activeId);
        const overColumn = COLUMNS.includes(overId) ? overId : orders.find(o => o.id === overId)?.status;

        if (orders[activeIndex].status !== overColumn) {
            const newOrders = [...orders];
            newOrders[activeIndex].status = overColumn;
            setOrders(newOrders);

            try {
                await api.patchWorkOrder(activeId, { status: overColumn });
            } catch {
                fetchAll();
            }
        }
    };

    const onSubmit = async (data) => {
        try {
            const payload = {
                ...data,
                created_by: user?.username || 'unknown',
                category: data.category || 'other'
            };
            await api.createWorkOrder(payload);
            toast.success("Work order created");
            setCreateMode(false);
            reset();
            fetchAll();
        } catch (e) {
            console.error("error submitting", e);
            const detail = e?.response?.data?.detail;
            const message = Array.isArray(detail) 
                ? detail.map(d => `${d.loc.join('.')}: ${d.msg}`).join(', ')
                : typeof detail === 'string' ? detail : e?.message || "Failed to submit";
            toast.error(message);
        }
    };

    const handleExport = async () => {
        try {
            const response = await api.client.get('/maintenance/workorders/export', {
                params: { format: 'csv' },
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'workorders.csv';
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (_e) {
            toast.error('Export failed');
        }
    };

    if (loading) return <div style={{ padding: '40px', color: 'var(--text-secondary)' }}>Loading Maintenance Board...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', margin: 0, color: 'var(--text-primary)' }}>Maintenance operations</h1>
                {canEdit && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-ghost" onClick={handleExport}>Export CSV</button>
                        <button className="btn btn-primary" onClick={() => setCreateMode(true)}>+ NEW WORK ORDER</button>
                    </div>
                )}
            </div>

            {createMode && (
                <div className="panel fade-in" style={{ padding: '20px', borderTop: '2px solid var(--info)' }}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', marginBottom: '16px' }}>Create work order</h2>
                    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label className="mono-text" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Farm</label>
                            <select {...register('farm_id')} style={{ width: '100%' }}>
                                <option value="">Select Farm...</option>
                                {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                            {errors.farm_id && <span style={{ color: 'var(--danger)', fontSize: '10px' }}>{errors.farm_id.message}</span>}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label className="mono-text" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>House</label>
                            <select {...register('house_id')} style={{ width: '100%' }} disabled={!selectedFarm}>
                                <option value="">Select House...</option>
                                {houses.map(h => <option key={h.id} value={h.id}>{h.house_code || h.name || h.id}</option>)}
                            </select>
                            {errors.house_id && <span style={{ color: 'var(--danger)', fontSize: '10px' }}>{errors.house_id.message}</span>}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label className="mono-text" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Category</label>
                            <select {...register('category')} style={{ width: '100%' }}>
                                <option value="">Select Category...</option>
                                <option value="mechanical">Mechanical</option>
                                <option value="electrical">Electrical</option>
                                <option value="plumbing">Plumbing</option>
                                <option value="structural">Structural</option>
                                <option value="environmental">Environmental</option>
                                <option value="other">Other</option>
                            </select>
                            {errors.category && <span style={{ color: 'var(--danger)', fontSize: '10px' }}>{errors.category.message}</span>}
                        </div>

                        <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label className="mono-text" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Description</label>
                            <input {...register('description')} placeholder="Description of work required" style={{ width: '100%' }} />
                            {errors.description && <span style={{ color: 'var(--danger)', fontSize: '10px' }}>{errors.description.message}</span>}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label className="mono-text" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Priority</label>
                            <select {...register('priority')} style={{ width: '100%' }}>
                                <option value="low">Low Priority</option>
                                <option value="medium">Medium Priority</option>
                                <option value="high">High Priority</option>
                                <option value="critical">Critical</option>
                            </select>
                        </div>

                        <div style={{ gridColumn: 'span 3', display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                            <button type="button" className="btn btn-ghost" onClick={() => setCreateMode(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary">Submit work order</button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', flex: 1, overflow: 'hidden' }}>
                <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
                    {COLUMNS.map(col => (
                        <DroppableColumn 
                            key={col} 
                            id={col} 
                            COLUMN_NAMES={COLUMN_NAMES} 
                            orders={orders} 
                        />
                    ))}
                </DndContext>
            </div>
        </div>
    );
}
