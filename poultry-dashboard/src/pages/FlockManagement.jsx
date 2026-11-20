import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '../lib/Api';
import { useAuth } from '../context/AuthContext';
import Skeleton from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import RoleLock from '../components/RoleLock';
import SetpointCurveEditor from '../components/SetpointCurveEditor';
import { DEFAULT_ENVIRONMENTAL, DEFAULT_NUTRITIONAL } from '../lib/curveDefaults';
import FlockCurvePanel from '../components/FlockCurvePanel';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { sentence } from '../lib/format';

// ── Zod schemas ────────────────────────────────────────────────────────────

const flockSchema = z.object({
  house_id:        z.string().min(1, 'Select a house'),
  breed:           z.string().min(1, 'Breed required'),
  placement_count: z.coerce.number().int().min(1, 'Must be at least 1'),
  placement_date:  z.string().min(1, 'Placement date required'),
  target_weight_g: z.coerce.number().min(100, 'Target weight required'),
  target_age_days: z.coerce.number().int().min(1).max(90),
});

const weightEntrySchema = z.object({
  value:       z.coerce.number().min(1, 'Weight required (grams)'),
  sample_size: z.coerce.number().int().min(1, 'Sample size required'),
  notes:       z.string().optional(),
});

const feedEntrySchema = z.object({
  value: z.coerce.number().min(0.1, 'Feed amount required (kg)'),
  notes: z.string().optional(),
});

const mortalitySchema = z.object({
  count: z.coerce.number().int().min(1, 'Count required'),
  notes: z.string().optional(),
});

// ── KPI card ──────────────────────────────────────────────────────────────

function KPICard({ label, value, unit, color, subtitle, index }) {
  return (
    <div className="panel corner-decor fade-in" style={{
      animationDelay: `${index * 0.05}s`,
      padding: '10px 12px',
      minHeight: '75px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center'
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 8,
        color: 'var(--text-dim)', letterSpacing: '0.12em',
        marginBottom: 4, textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 2 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 22,
          color: color ?? 'var(--text-primary)', lineHeight: 1,
        }}>
          {value ?? '—'}
        </span>
        {unit && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--text-dim)',
          }}>
            {unit}
          </span>
        )}
      </div>
      {subtitle && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--text-dim)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

// ── Flock card ─────────────────────────────────────────────────────────────

function FlockCard({ flock, kpis, isSelected, onClick, farms, houses }) {
  const agePercent = Math.min(100,
    ((kpis?.age_days ?? 0) / (flock.target_age_days ?? 42)) * 100
  );
  const mortalityColor = (kpis?.mortality_rate ?? 0) > 5 ? 'var(--danger)'
    : (kpis?.mortality_rate ?? 0) > 2 ? 'var(--warn)'
    : 'var(--ok)';

  return (
    <div
      onClick={onClick}
      className="panel fade-in"
      style={{
        padding: 0, cursor: 'pointer',
        borderColor: isSelected ? 'var(--accent)' : 'var(--border-dim)',
        background: isSelected ? 'var(--accent-glow)' : 'var(--bg-panel)',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ padding: '12px 14px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 13,
              fontWeight: 600, letterSpacing: '0.05em',
              textTransform: 'uppercase', color: 'var(--text-primary)',
            }}>
              {flock.flock_id}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--text-dim)', marginTop: 2,
            }}>
              {(() => {
                const f = farms?.find(f => (f.id ?? f._id) === flock.farm_id);
                const h = houses?.find(h => (h.id ?? h._id) === flock.house_id);
                const fName = f?.name ?? (flock.farm_id ? `FARM ${flock.farm_id.slice(-4)}` : 'Unknown farm');
                const hName = h?.house_code ?? (flock.house_id ? `HOUSE ${flock.house_id.slice(-4)}` : 'Unknown house');
                return `${fName} · ${hName} · ${flock.breed}`;
              })()}
            </div>
          </div>
          <span className={`status-badge ${flock.status === 'active' ? 'ok' : 'danger'}`}>
            {sentence(flock.status)}
          </span>
        </div>

        {/* Age progress */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--text-dim)',
            }}>
              Day {kpis?.age_days ?? '—'} / {flock.target_age_days}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--text-dim)',
            }}>
              {kpis ? `${kpis.days_to_target}d remaining` : ''}
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--bg-surface)', borderRadius: 2 }}>
            <div style={{
              height: '100%', width: `${agePercent}%`,
              background: 'var(--accent)', borderRadius: 2,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 16 }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-dim)', letterSpacing: '0.1em',
            }}>Live birds</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 14,
              color: 'var(--text-primary)',
            }}>
              {(kpis?.live_count ?? flock.placement_count)?.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-dim)', letterSpacing: '0.1em',
            }}>Mortality</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 14,
              color: mortalityColor,
            }}>
              {kpis?.mortality_rate != null ? `${kpis.mortality_rate.toFixed(1)}%` : '—'}
            </div>
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-dim)', letterSpacing: '0.1em',
            }}>Avg weight</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 14,
              color: 'var(--text-primary)',
            }}>
              {kpis?.latest_weight_g
                ? `${(kpis.latest_weight_g / 1000).toFixed(2)}kg`
                : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Entry form ─────────────────────────────────────────────────────────────

function EntryForm({ flockId, type, onSuccess }) {
  const schema = type === 'weight' ? weightEntrySchema
    : type === 'feed' ? feedEntrySchema
    : mortalitySchema;

  const { register, handleSubmit, reset,
          formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data) => {
    try {
      if (type === 'mortality') {
        await api.createMortality(flockId, { ...data, source: 'manual' });
        toast.success(`${data.count} mortality events recorded`);
      } else {
        await api.createFlockEntry(flockId, { ...data, entry_type: type });
        toast.success(`${type === 'weight' ? 'Weight' : 'Feed'} entry recorded`);
      }
      reset();
      onSuccess();
    } catch (e) {
      toast.error(e?.response?.data?.detail ?? 'Entry failed');
    }
  };

  const fieldConfig = {
    weight:    { label: 'Average Weight (g)', placeholder: 'e.g. 1250',  extra: { label: 'Sample Size (birds weighed)', key: 'sample_size', placeholder: 'e.g. 50' } },
    feed:      { label: 'Feed Consumed (kg)', placeholder: 'e.g. 125.5', extra: null },
    mortality: { label: 'Mortality Count',    placeholder: 'e.g. 3',     extra: null },
  }[type];

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <label style={{
          display: 'block', fontFamily: 'var(--font-mono)',
          fontSize: 10, color: errors.value ? 'var(--danger)' : 'var(--text-dim)',
          letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6,
        }}>
          {fieldConfig.label}
          {errors.value && <span style={{ marginLeft: 6 }}>— {errors.value.message}</span>}
        </label>
        <input
          {...register(type === 'mortality' ? 'count' : 'value')}
          type="number"
          step="0.1"
          placeholder={fieldConfig.placeholder}
          style={{
            width: '100%', background: 'var(--bg-surface)',
            border: `1px solid ${errors.value ? 'var(--danger)' : 'var(--border-mid)'}`,
            color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
            fontSize: 13, padding: '7px 10px',
            borderRadius: 'var(--radius)', outline: 'none',
          }}
        />
      </div>

      {fieldConfig.extra && (
        <div>
          <label style={{
            display: 'block', fontFamily: 'var(--font-mono)',
            fontSize: 10, color: 'var(--text-dim)',
            letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6,
          }}>
            {fieldConfig.extra.label}
          </label>
          <input
            {...register(fieldConfig.extra.key)}
            type="number"
            placeholder={fieldConfig.extra.placeholder}
            style={{
              width: '100%', background: 'var(--bg-surface)',
              border: '1px solid var(--border-mid)',
              color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
              fontSize: 13, padding: '7px 10px',
              borderRadius: 'var(--radius)', outline: 'none',
            }}
          />
        </div>
      )}

      <div>
        <label style={{
          display: 'block', fontFamily: 'var(--font-mono)',
          fontSize: 10, color: 'var(--text-dim)',
          letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6,
        }}>
          Notes (optional)
        </label>
        <input
          {...register('notes')}
          placeholder="Any relevant observations..."
          style={{
            width: '100%', background: 'var(--bg-surface)',
            border: '1px solid var(--border-dim)',
            color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
            fontSize: 13, padding: '7px 10px',
            borderRadius: 'var(--radius)', outline: 'none',
          }}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        style={{
          padding: '8px 0', width: '100%',
          fontFamily: 'var(--font-mono)', fontSize: 11,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          border: `1px solid ${type === 'mortality' ? 'var(--danger)' : 'var(--accent)'}`,
          background: type === 'mortality' ? 'var(--danger-glow)' : 'var(--accent-glow)',
          color: type === 'mortality' ? 'var(--danger)' : 'var(--accent)',
          cursor: isSubmitting ? 'not-allowed' : 'pointer',
          borderRadius: 'var(--radius)',
          opacity: isSubmitting ? 0.6 : 1,
        }}
      >
        {isSubmitting ? 'Saving…' : `Record ${sentence(type).toLowerCase()}`}
      </button>
    </form>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function FlockManagement() {
  const { user } = useAuth();
  const [flocks,          setFlocks]          = useState([]);
  const [selectedFlockId, setSelectedFlockId] = useState(null);
  const [kpis,            setKpis]            = useState(null);
  const [entries,         setEntries]         = useState([]);
  const [mortality,       setMortality]       = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [kpisLoading,     setKpisLoading]     = useState(false);
  const [activeTab,       setActiveTab]       = useState('weight');
  const [showNewFlock,    setShowNewFlock]     = useState(false);
  const [houses,          setHouses]          = useState([]);
  const [farms,           setFarms]           = useState([]);
  const [kpisById,        setKpisById]        = useState({});   // KPIs for every card in the list

  // Load flocks + houses + farms
  useEffect(() => {
    api.getFarms().then(farmsData => {
      setFarms(farmsData);
      return Promise.all([
        api.getFlocks({ status: 'active' }),
        Promise.all(farmsData.map(f => api.getFarmHouses(f.id ?? f.farm_id))).then(nested => nested.flat())
      ]);
    })
      .then(([f, h]) => { setFlocks(f); setHouses(h); })
      .catch(() => toast.error('Failed to load flock data'))
      .finally(() => setLoading(false));
  }, []);

  // KPIs for all listed flocks, so every card shows its real age / mortality / weight
  useEffect(() => {
    if (!flocks.length) return;
    let alive = true;
    Promise.all(flocks.map(f => {
      const id = f._id ?? f.id;
      return api.getFlockKPIs(id).then(k => [id, k]).catch(() => [id, null]);
    })).then(pairs => { if (alive) setKpisById(Object.fromEntries(pairs)); });
    return () => { alive = false; };
  }, [flocks]);

  // Load KPIs when flock selected
  useEffect(() => {
    if (!selectedFlockId) return;
     
    setKpisLoading(true);
    // Adding slight debounce/error handling natively
    api.getFlockKPIs(selectedFlockId)
       .then(setKpis)
       .catch(() => setKpis(null));
       
    api.getFlockEntries(selectedFlockId)
       .then(setEntries)
       .catch(() => setEntries([]));
       
    api.getMortality(selectedFlockId)
       .then(setMortality)
       .catch(() => setMortality([]))
       .finally(() => setKpisLoading(false));
  }, [selectedFlockId]);

  const selectedFlock = flocks.find(f => (f._id ?? f.id) === selectedFlockId);

  // Weight growth chart data
  // Merge actual weights with standard curve
  const weightChartData = React.useMemo(() => {
    if (!kpis?.standard_curve) return [];
    
    // Create map of actual weights for quick lookup
    const actualMap = {};
    entries
      .filter(e => e.entry_type === 'weight')
      .forEach(e => {
        actualMap[e.day] = e.value;
      });

    return kpis.standard_curve.map(point => ({
      day: `Day ${point.day}`,
      standard: point.standard_weight,
      actual: actualMap[point.day] || null,
    }));
  }, [kpis, entries]);

  return (
    <div className="page" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Flock Management</div>
          <div className="page-subtitle">
            Grow-out tracking · {flocks.length} active flocks
          </div>
        </div>
        <RoleLock requires="supervisor">
          <button
            onClick={() => setShowNewFlock(f => !f)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              border: `1px solid ${showNewFlock ? 'var(--border-mid)' : 'var(--accent)'}`,
              background: showNewFlock ? 'transparent' : 'var(--accent-glow)',
              color: showNewFlock ? 'var(--text-secondary)' : 'var(--accent)',
              cursor: 'pointer', borderRadius: 'var(--radius)',
              transition: 'all 0.15s',
            }}
          >
            {showNewFlock ? 'Cancel' : '+ NEW FLOCK'}
          </button>
        </RoleLock>
      </div>

      {/* New flock form */}
      {showNewFlock && (
        <NewFlockForm
          houses={houses}
          userId={user?.id ?? user?._id}
          onSuccess={(flock) => {
            setFlocks(prev => [...prev, flock]);
            setShowNewFlock(false);
            setSelectedFlockId(flock._id ?? flock.id);
            toast.success(`Flock ${flock.flock_id} created`);
          }}
        />
      )}

      {/* Two column layout: flock list + detail */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 300px) 1fr', gap: 14, paddingBottom: '24px', alignItems: 'start' }}>

        {/* Flock list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={130} />)
          ) : flocks.length === 0 ? (
            <EmptyState
              icon="data"
              title="No active flocks"
              subtitle="Create a flock to start tracking"
            />
          ) : (
            flocks.map(flock => (
              <FlockCard
                key={flock._id ?? flock.id}
                flock={flock}
                kpis={selectedFlockId === (flock._id ?? flock.id) && kpis ? kpis : kpisById[flock._id ?? flock.id]}
                isSelected={selectedFlockId === (flock._id ?? flock.id)}
                onClick={() => setSelectedFlockId(flock._id ?? flock.id)}
                farms={farms}
                houses={houses}
              />
            ))
          )}
        </div>

        {/* Flock detail */}
        {selectedFlock ? (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 14, 
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-mid)',
            borderRadius: '4px',
            padding: '16px'
          }}>

            {/* KPI cards */}
            {kpisLoading ? (
              <div className="grid-4" style={{ gap: 10 }}>
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={80} />)}
              </div>
            ) : kpis && (
              <>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(115px, 1fr))', 
                  gap: '8px' 
                }}>
                  <KPICard label="Age" value={kpis.age_days} unit="days"
                    color="var(--accent)" index={0} />
                  <KPICard label="Live count" value={kpis.live_count?.toLocaleString()}
                    color="var(--ok)" index={1} />
                  <KPICard label="Mortality rate"
                    value={kpis.mortality_rate?.toFixed(1)} unit="%"
                    color={kpis.mortality_rate > 5 ? 'var(--danger)'
                      : kpis.mortality_rate > 2 ? 'var(--warn)' : 'var(--ok)'}
                    index={2} />
                  <KPICard label="Avg weight"
                    value={kpis.latest_weight_g
                      ? (kpis.latest_weight_g / 1000).toFixed(2) : null}
                    unit="kg" index={3} />
                  <KPICard label="Adg"
                    value={kpis.adg_g?.toFixed(0)} unit="g/day"
                    subtitle="Avg daily gain" index={4} />
                  <KPICard label="Growth vs Std"
                    value={(kpis.growth_deviation_pct > 0 ? '+' : '') + (kpis.growth_deviation_pct ?? '0.0')}
                    unit="%"
                    color={kpis.growth_deviation_pct >= 0 ? 'var(--ok)' : 'var(--warn)'}
                    subtitle={`Std: ${(kpis.standard_weight_g/1000).toFixed(2)}kg`}
                    index={5} />
                  <KPICard label="Total feed"
                    value={kpis.total_feed_kg?.toFixed(0)} unit="kg" index={6} />
                  <KPICard label="FCR"
                    value={kpis.fcr?.toFixed(2)}
                    color={!kpis.fcr ? 'var(--text-dim)' : kpis.fcr < 1.6 ? 'var(--ok)'
                      : kpis.fcr < 1.9 ? 'var(--warn)' : 'var(--danger)'}
                    subtitle="Feed conversion" index={7} />
                  <KPICard label="EPEF"
                    value={kpis.epef}
                    color={!kpis.epef ? 'var(--text-dim)' : kpis.epef > 350 ? 'var(--ok)'
                      : kpis.epef > 280 ? 'var(--warn)' : 'var(--danger)'}
                    subtitle="Performance" index={8} />
                </div>

                {/* Projected weight callout */}
                {kpis.projected_weight_g && (
                  <div className="panel" style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div>
                        <div style={{
                          fontFamily: 'var(--font-mono)', fontSize: 9,
                          color: 'var(--text-dim)', letterSpacing: '0.15em',
                          marginBottom: 4,
                        }}>
                          Projected slaughter weight
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 32,
                            color: 'var(--text-primary)', lineHeight: 1,
                          }}>
                            {(kpis.projected_weight_g / 1000).toFixed(2)}
                          </span>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 14,
                            color: 'var(--text-dim)',
                          }}>
                            kg at day {selectedFlock.target_age_days}
                          </span>
                        </div>
                      </div>
                      <div style={{
                        width: 1, height: 40,
                        background: 'var(--border-dim)', flexShrink: 0,
                      }} />
                      <div>
                        <div style={{
                          fontFamily: 'var(--font-mono)', fontSize: 9,
                          color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 4,
                        }}>
                          Target
                        </div>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 18,
                          color: Math.abs(kpis.projected_weight_g - selectedFlock.target_weight_g) < 100
                            ? 'var(--ok)' : 'var(--warn)',
                        }}>
                          {(selectedFlock.target_weight_g / 1000).toFixed(2)} kg
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {/* Weight growth chart */}
                <div className="panel" style={{ padding: 0, marginTop: '8px' }}>
                  <div className="panel-header">
                    <span className="panel-title">
                      <span className="panel-title-accent">◈</span> Weight growth curve
                    </span>
                  </div>
                  <div style={{ flexShrink: 0, minWidth: 0 }}>
                    <ResponsiveContainer width="99%" height={260} key={selectedFlockId}>
                      <LineChart data={weightChartData}>
                        <CartesianGrid stroke="var(--border-dim)" strokeDasharray="3 6" vertical={false} />
                        <XAxis dataKey="day"
                          tick={{ fill: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                          tickLine={false} axisLine={{ stroke: 'var(--border-dim)' }} />
                        <YAxis
                          tick={{ fill: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                          tickLine={false} axisLine={false} width={50}
                          tickFormatter={v => `${(v/1000).toFixed(1)}kg`} />
                        <Tooltip
                          contentStyle={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-mid)',
                            fontFamily: 'var(--font-mono)', fontSize: 11,
                          }}
                          formatter={(v, name) => [
                            `${(v/1000).toFixed(2)}kg`, 
                            name === 'actual' ? 'Actual Weight' : 'Breed Standard'
                          ]}
                        />
                        <ReferenceLine
                          y={selectedFlock.target_weight_g}
                          stroke="var(--accent)" strokeDasharray="4 4" strokeOpacity={0.6}
                          label={{ position: 'right', value: 'TARGET', fill: 'var(--accent)', fontSize: 9, fontFamily: 'var(--font-mono)' }}
                        />
                        <Line type="monotone" dataKey="standard" stroke="var(--text-dim)"
                          strokeWidth={1} strokeDasharray="5 5" dot={false}
                          isAnimationActive={false} />
                        <Line type="monotone" dataKey="actual" stroke="var(--ok)"
                          strokeWidth={2} dot={{ r: 4, fill: 'var(--ok)' }}
                          connectNulls={true}
                          isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {selectedFlock && kpis && (
                  <FlockCurvePanel flock={selectedFlock} kpis={kpis} />
                )}
              </>
            )}

            {/* Bottom row: Data entry + Mortality limit */}
            <div style={{ display: 'grid', gridTemplateColumns: mortality.length > 0 ? '1fr 1fr' : '1fr', gap: '14px' }}>
              
              {/* Data entry tabs */}
              <div className="panel" style={{ padding: 0 }}>
                <div className="panel-header">
                  <span className="panel-title">
                    <span className="panel-title-accent">◈</span> Record data
                  </span>
                </div>

                {/* Tab strip */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-dim)' }}>
                  {[
                    { key: 'weight',    label: 'Weigh Birds',    color: 'var(--ok)'     },
                    { key: 'feed',      label: 'Feed Consumed',  color: 'var(--accent)' },
                    { key: 'mortality', label: 'Mortality',      color: 'var(--danger)' },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      style={{
                        flex: 1, padding: '10px 8px',
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        border: 'none',
                        borderBottom: `2px solid ${activeTab === tab.key ? tab.color : 'transparent'}`,
                        background: activeTab === tab.key ? `${tab.color}11` : 'transparent',
                        color: activeTab === tab.key ? tab.color : 'var(--text-dim)',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div style={{ padding: '16px 20px 20px' }}>
                  <RoleLock requires="operator">
                    <EntryForm
                      key={activeTab}
                      flockId={selectedFlockId}
                      type={activeTab}
                      onSuccess={() => {
                        // Refresh dependencies safely
                        api.getFlockKPIs(selectedFlockId).then(setKpis).catch(()=>{});
                        api.getFlockEntries(selectedFlockId).then(setEntries).catch(()=>{});
                        api.getMortality(selectedFlockId).then(setMortality).catch(()=>{});
                      }}
                    />
                  </RoleLock>
                </div>
              </div>

              {/* Mortality log */}
              {mortality.length > 0 && (
                <div className="panel" style={{ padding: 0 }}>
                  <div className="panel-header">
                    <span className="panel-title">
                      <span style={{ color: 'var(--danger)' }}>◈</span> Mortality log
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      color: 'var(--danger)', background: 'var(--danger-glow)',
                      border: '1px solid rgba(232,58,32,0.3)',
                      padding: '2px 6px', borderRadius: 'var(--radius)',
                    }}>
                      {mortality.reduce((sum, m) => sum + m.count, 0)} total
                    </span>
                  </div>
                  <div style={{ overflowY: 'auto', maxHeight: '310px' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Count</th>
                          <th>Source</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mortality.map((m, i) => (
                          <tr key={i}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                              Day {m.day}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>
                              {m.count}
                            </td>
                            <td>
                              <span style={{
                                fontFamily: 'var(--font-mono)', fontSize: 10,
                                color: 'var(--text-secondary)',
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-dim)',
                                padding: '2px 6px', borderRadius: 'var(--radius)',
                              }}>
                                Manual
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: 9 }} className={`status-badge ${m.acknowledged ? 'ok' : 'warn'}`}>
                                {m.acknowledged ? 'Ack' : 'Pen'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%',
          }}>
            <EmptyState
              icon="data"
              title="Select a flock"
              subtitle="Click a flock card on the left to view KPIs and record data"
            />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// ── New flock form ─────────────────────────────────────────────────────────

function NewFlockForm({ houses, userId, onSuccess }) {
  const [step, setStep] = useState(1);         // 1 = info, 2 = env curve, 3 = nutrition curve
  const [flockInfo, setFlockInfo]   = useState(null);
  const [envCurve,  setEnvCurve]    = useState(DEFAULT_ENVIRONMENTAL);
  const [nutCurve,  setNutCurve]    = useState(DEFAULT_NUTRITIONAL);
  const [saving,    setSaving]      = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(flockSchema),
    defaultValues: { target_age_days: 42 },
  });

  const onStep1Submit = (data) => {
    setFlockInfo(data);
    setStep(2);
  };

  const handleFinalSubmit = async () => {
    setSaving(true);
    try {
      // 1. Create flock
      const flock = await api.createFlock({
        ...flockInfo,
        placement_count: Number(flockInfo.placement_count),
        target_weight_g: Number(flockInfo.target_weight_g),
        target_age_days: Number(flockInfo.target_age_days),
        created_by:      userId,
      });

      const flockId = flock._id ?? flock.id;

      // 2. Save environmental curve
      await api.createFlockCurve(flockId, {
        curve_type:  'environmental',
        checkpoints: envCurve,
      });

      // 3. Save nutritional curve
      await api.createFlockCurve(flockId, {
        curve_type:  'nutritional',
        checkpoints: nutCurve,
      });

      toast.success(`Flock ${flock.flock_id} placed — setpoint curves active`);
      onSuccess(flock);
      reset();
      setStep(1);
    } catch (e) {
      toast.error(e?.response?.data?.detail ?? 'Failed to create flock');
    } finally {
      setSaving(false);
    }
  };

  const STEPS = [
    { n: 1, label: 'Flock Info' },
    { n: 2, label: 'Environment Curves' },
    { n: 3, label: 'Nutrition Curves' },
  ];

  const inputSty = (err) => ({
    width: '100%', background: 'var(--bg-surface)',
    border: `1px solid ${err ? 'var(--danger)' : 'var(--border-mid)'}`,
    color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
    fontSize: 13, padding: '7px 10px',
    borderRadius: 'var(--radius)', outline: 'none', boxSizing: 'border-box',
  });

  return (
    <div className="panel fade-in" style={{ padding: 0, marginBottom: '16px' }}>
      {/* Step header */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border-dim)',
        padding: '0 20px',
      }}>
        {STEPS.map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '14px 16px 14px 0',
            marginRight: 16,
            borderBottom: `2px solid ${step === s.n ? 'var(--accent)' : 'transparent'}`,
            cursor: step > s.n ? 'pointer' : 'default',
            opacity: step < s.n ? 0.4 : 1,
            transition: 'all 0.15s',
          }}
            onClick={() => step > s.n && setStep(s.n)}
          >
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: step > s.n ? 'var(--ok)' : step === s.n ? 'var(--accent)' : 'var(--bg-surface)',
              border: `1.5px solid ${step > s.n ? 'var(--ok)' : step === s.n ? 'var(--accent)' : 'var(--border-mid)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: step >= s.n ? 'white' : 'var(--text-dim)',
              flexShrink: 0,
            }}>
              {step > s.n ? '✓' : s.n}
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: step === s.n ? 'var(--accent)' : 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1 — Flock info */}
      {step === 1 && (
        <form onSubmit={handleSubmit(onStep1Submit)} style={{ padding: '16px 20px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) minmax(150px, 1fr) minmax(150px, 1fr)', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: errors.house_id ? 'var(--danger)' : 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                House{errors.house_id && ` — ${errors.house_id.message}`}
              </label>
              <select {...register('house_id')} style={{ ...inputSty(errors.house_id), appearance: 'none', cursor: 'pointer' }}>
                <option value="">Select house...</option>
                {houses.map(h => (
                  <option key={h.id ?? h._id} value={h.id ?? h._id}>
                    {h.name ?? h.house_code ?? h.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: errors.breed ? 'var(--danger)' : 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                Breed{errors.breed && ` — ${errors.breed.message}`}
              </label>
              <input {...register('breed')} placeholder="e.g. Ross 308" style={inputSty(errors.breed)} />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: errors.placement_date ? 'var(--danger)' : 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                Placement Date
              </label>
              <input {...register('placement_date')} type="date" style={inputSty(errors.placement_date)} />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: errors.placement_count ? 'var(--danger)' : 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                Bird Count{errors.placement_count && ` — ${errors.placement_count.message}`}
              </label>
              <input {...register('placement_count')} type="number" placeholder="e.g. 5000" style={inputSty(errors.placement_count)} />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: errors.target_weight_g ? 'var(--danger)' : 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                Target Weight (g)
              </label>
              <input {...register('target_weight_g')} type="number" placeholder="e.g. 2500" style={inputSty(errors.target_weight_g)} />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: errors.target_age_days ? 'var(--danger)' : 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                Target Age (days)
              </label>
              <input {...register('target_age_days')} type="number" defaultValue={42} style={inputSty(errors.target_age_days)} />
            </div>
          </div>
          <button type="submit" style={{
            marginTop: '16px', padding: '9px 0', width: '100%',
            fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            border: '1px solid var(--accent)', background: 'var(--accent-glow)',
            color: 'var(--accent)', cursor: 'pointer',
            borderRadius: 'var(--radius)'
          }}>
            NEXT — SET CURVES →
          </button>
        </form>
      )}

      {/* Step 2 — Environmental curves */}
      {step === 2 && (
        <div style={{ padding: '16px 20px 20px' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
            Define target environment values at each age checkpoint.
            The system will interpolate between checkpoints and automatically
            control fans, heater, and ventilation to meet these targets.
          </p>
          <SetpointCurveEditor
            flockId={null}
            curveType="environmental"
            onChange={setEnvCurve}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={() => setStep(1)} style={{
              padding: '9px 20px', fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid var(--border-mid)',
              background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: 'var(--radius)'
            }}>← Back</button>
            <button onClick={() => setStep(3)} style={{
              padding: '9px 20px', fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid var(--accent)',
              background: 'var(--accent-glow)', color: 'var(--accent)', cursor: 'pointer', borderRadius: 'var(--radius)'
            }}>Next — nutrition curves →</button>
          </div>
        </div>
      )}

      {/* Step 3 — Nutritional curves */}
      {step === 3 && (
        <div style={{ padding: '16px 20px 20px' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
            Define target weight and feed/water allocations per sex at each age.
            The feeder and waterer will be programmed automatically based on these targets.
          </p>
          <SetpointCurveEditor
            flockId={null}
            curveType="nutritional"
            onChange={setNutCurve}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={() => setStep(2)} style={{
              padding: '9px 20px', fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid var(--border-mid)',
              background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: 'var(--radius)'
            }}>← Back</button>
            <button
              onClick={handleFinalSubmit}
              disabled={saving}
              style={{
                padding: '9px 20px', fontFamily: 'var(--font-mono)', fontSize: 11,
                letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid var(--ok)',
                background: 'var(--ok-glow)', color: 'var(--ok)', cursor: saving ? 'not-allowed' : 'pointer', borderRadius: 'var(--radius)', opacity: saving ? 0.6 : 1
              }}
            >
              {saving ? 'Placing flock…' : '✓ PLACE FLOCK & ACTIVATE CURVES'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
