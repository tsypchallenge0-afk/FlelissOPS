import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/Api';
import { Scale, Wheat, Droplets, Thermometer, Wind, CloudFog } from 'lucide-react';
import { DEFAULT_NUTRITIONAL, DEFAULT_ENVIRONMENTAL } from '../lib/curveDefaults';

// ── Column definitions ─────────────────────────────────────────────────────

const NUTRITIONAL_COLUMNS = [
  { key: 'female_weight_g',  label: 'Poids',    sublabel: 'femelles', unit: 'g',  icon: Scale, color: '#e84040' },
  { key: 'female_feed_g',    label: 'Aliment',  sublabel: 'femelles', unit: 'g',  icon: Wheat, color: '#e8a020' },
  { key: 'female_water_ml',  label: 'Eau',      sublabel: 'femelles', unit: 'mL', icon: Droplets, color: '#20a0e8' },
  { key: 'male_weight_g',    label: 'Poids',    sublabel: 'mâles',    unit: 'g',  icon: Scale, color: '#e84040' },
  { key: 'male_feed_g',      label: 'Aliment',  sublabel: 'mâles',    unit: 'g',  icon: Wheat, color: '#e8a020' },
  { key: 'male_water_ml',    label: 'Eau',      sublabel: 'mâles',    unit: 'mL', icon: Droplets, color: '#20a0e8' },
];

const ENVIRONMENTAL_COLUMNS = [
  { key: 'temperature_c',   label: 'Température',   sublabel: '',  unit: '°C',       icon: Thermometer, color: '#e84040' },
  { key: 'humidity_pct',    label: 'Hygrométrie',   sublabel: '',  unit: '%',         icon: Droplets, color: '#20a0e8' },
  { key: 'air_requirement', label: "Besoin d'air",  sublabel: '',  unit: 'm³/h/kg',   icon: Wind, color: '#20e8a0' },
  { key: 'co2_ppm',         label: 'CO₂',           sublabel: '',  unit: 'ppm',       icon: CloudFog,  color: '#a0a0a0' },
];

// ── Cell editor ────────────────────────────────────────────────────────────

function EditableCell({ value, unit, color, onChange, readOnly }) {
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState(String(value ?? ''));

  const commit = () => {
    setEditing(false);
    const num = parseFloat(localVal);
    if (!isNaN(num)) onChange(num);
    else setLocalVal(String(value ?? ''));
  };

  if (readOnly) {
    return (
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-dim)',
        borderRadius: 'var(--radius)',
        padding: '10px 12px',
        minWidth: 80, textAlign: 'right',
        position: 'relative',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-primary)', fontStyle: 'italic' }}>
          {value != null ? value : '—'}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginLeft: 2 }}>
          {unit}
        </span>
        <span style={{ position: 'absolute', bottom: 3, right: 5, fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)', opacity: 0.5 }}>
          {/* day label would go here */}
        </span>
      </div>
    );
  }

  if (editing) {
    return (
      <div style={{ position: 'relative' }}>
        <input
          autoFocus
          type="number"
          value={localVal}
          onChange={e => setLocalVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setLocalVal(String(value ?? '')); } }}
          style={{
            width: '100%', minWidth: 80,
            background: `${color}18`,
            border: `1.5px solid ${color}`,
            borderRadius: 'var(--radius)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 15, padding: '9px 10px',
            outline: 'none', textAlign: 'right',
            boxSizing: 'border-box',
          }}
        />
        <span style={{
          position: 'absolute', right: 6, bottom: 4,
          fontFamily: 'var(--font-mono)', fontSize: 10, color, opacity: 0.7,
        }}>
          {unit}
        </span>
      </div>
    );
  }

  return (
    <div
      onClick={() => { setEditing(true); setLocalVal(String(value ?? '')); }}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-dim)',
        borderRadius: 'var(--radius)',
        padding: '10px 12px',
        minWidth: 80, textAlign: 'right',
        cursor: 'pointer', position: 'relative',
        transition: 'all 0.12s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = color;
        e.currentTarget.style.background  = `${color}10`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border-dim)';
        e.currentTarget.style.background  = 'var(--bg-surface)';
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-primary)', fontStyle: 'italic' }}>
        {value != null ? value : '—'}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginLeft: 2 }}>
        {unit}
      </span>
      <span style={{
        position: 'absolute', bottom: 3, right: 5,
        fontFamily: 'var(--font-mono)', fontSize: 8,
        color: 'var(--text-dim)', opacity: 0.6,
      }}>
        {/* Filled by parent */}
      </span>
    </div>
  );
}

// ── Day row label ──────────────────────────────────────────────────────────

function DayCell({ checkpoint, isToday }) {
  return (
    <div style={{
      background: isToday ? 'var(--accent-glow)' : 'var(--bg-surface)',
      border: `1px solid ${isToday ? 'var(--accent)' : 'var(--border-dim)'}`,
      borderRadius: 'var(--radius)',
      padding: '10px 14px',
      minWidth: 70, textAlign: 'center',
      position: 'relative',
    }}>
      <span style={{
        fontFamily: 'var(--font-display)',
        fontSize: checkpoint.label === 'Début' ? 15 : 18,
        fontWeight: 600,
        letterSpacing: '0.06em',
        color: isToday ? 'var(--accent)' : 'var(--text-primary)',
        fontStyle: checkpoint.label === 'Début' ? 'italic' : 'normal',
      }}>
        {checkpoint.label}
      </span>
      {isToday && (
        <div style={{
          position: 'absolute', top: -6, right: -6,
          width: 12, height: 12, borderRadius: '50%',
          background: 'var(--accent)',
          border: '2px solid var(--bg-panel)',
          boxShadow: '0 0 6px var(--accent)',
        }} />
      )}
    </div>
  );
}

// ── Live setpoint row (current day interpolated) ────────────────────────────

function LiveSetpointRow({ todaySetpoints, columns, ageDay }) {
  if (!todaySetpoints) return null;

  return (
    <tr style={{ background: 'var(--accent-glow)' }}>
      <td style={{ padding: '8px 6px' }}>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1.5px solid var(--accent)',
          borderRadius: 'var(--radius)',
          padding: '10px 12px', textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 2 }}>Today</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            J{ageDay}
          </div>
        </div>
      </td>
      {columns.map((col, i) => (
        <td key={i} style={{ padding: '8px 6px' }}>
          <div style={{
            background: `${col.color}18`,
            border: `1.5px solid ${col.color}60`,
            borderRadius: 'var(--radius)',
            padding: '10px 12px', textAlign: 'right',
            position: 'relative',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: col.color, boxShadow: `0 0 6px ${col.color}`, animation: 'pulse-dot 1.5s infinite', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: col.color, fontStyle: 'italic' }}>
                {todaySetpoints[col.key] != null ? todaySetpoints[col.key] : '—'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                {col.unit}
              </span>
            </div>
          </div>
        </td>
      ))}
      <td />
    </tr>
  );
}

// ── Main SetpointCurveEditor ───────────────────────────────────────────────

export default function SetpointCurveEditor({
  flockId,           // null during flock creation, set after flock is saved
  ageDay,            // current flock age — null during creation
  initialCurve,      // pre-loaded curve data (for edit mode)
  todaySetpoints,    // interpolated values for today (for edit mode)
  curveType,         // 'nutritional' | 'environmental'
  onChange,          // callback(checkpoints) — called on every edit during creation
  onSave,            // callback after successful PATCH save
  readOnly,          // true when viewing without edit permission
}) {
  const columns = curveType === 'nutritional' ? NUTRITIONAL_COLUMNS : ENVIRONMENTAL_COLUMNS;
  const defaultCheckpoints = curveType === 'nutritional' ? DEFAULT_NUTRITIONAL : DEFAULT_ENVIRONMENTAL;

  const [checkpoints, setCheckpoints] = useState(
    initialCurve?.checkpoints ?? defaultCheckpoints
  );
  const [saving, setSaving]         = useState(false);
  const [templates, setTemplates]   = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateName, setTemplateName]   = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [dirty, setDirty]           = useState(false);

  // Update a single cell value
  const updateCell = useCallback((dayIndex, field, value) => {
    setCheckpoints(prev => {
      const next = prev.map((cp, i) =>
        i === dayIndex ? { ...cp, [field]: value } : cp
      );
      onChange?.(next);
      setDirty(true);
      return next;
    });
  }, [onChange]);

  // Add a new checkpoint row
  const addRow = () => {
    const lastDay = checkpoints[checkpoints.length - 1]?.day ?? 0;
    const newDay  = lastDay + 7;
    const newLabel = `J${newDay}`;
    const emptyFields = curveType === 'nutritional'
      ? { female_weight_g: null, female_feed_g: null, female_water_ml: null, male_weight_g: null, male_feed_g: null, male_water_ml: null }
      : { temperature_c: null, humidity_pct: null, air_requirement: null, co2_ppm: null };

    setCheckpoints(prev => {
      const next = [...prev, { day: newDay, label: newLabel, ...emptyFields }];
      onChange?.(next);
      setDirty(true);
      return next;
    });
  };

  // Remove a checkpoint row (min 2 rows required)
  const removeRow = (index) => {
    if (checkpoints.length <= 2) {
      toast.error('Minimum 2 checkpoints required');
      return;
    }
    setCheckpoints(prev => {
      const next = prev.filter((_, i) => i !== index);
      onChange?.(next);
      setDirty(true);
      return next;
    });
  };

  // Save to backend (edit mode only)
  const handleSave = async () => {
    if (!flockId) return;
    setSaving(true);
    try {
      await api.updateFlockCurve(flockId, curveType, { checkpoints });
      toast.success(`${curveType === 'nutritional' ? 'Nutritional' : 'Environmental'} curve saved — setpoints applied immediately`);
      setDirty(false);
      onSave?.(checkpoints);
    } catch (e) {
      toast.error(e?.response?.data?.detail ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Load a template
  const loadTemplate = async () => {
    try {
      const list = await api.getCurveTemplates(curveType);
      setTemplates(list);
      setShowTemplates(true);
    } catch {
      toast.error('Failed to load templates');
    }
  };

  // Apply selected template
  const applyTemplate = (template) => {
    setCheckpoints(template.checkpoints);
    onChange?.(template.checkpoints);
    setDirty(true);
    setShowTemplates(false);
    toast.success(`Template "${template.template_name}" applied`);
  };

  // Save current as template
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) { toast.error('Enter a template name'); return; }
    setSavingTemplate(true);
    try {
      await api.saveAsTemplate({
        curve_type:    curveType,
        checkpoints,
        is_template:   true,
        template_name: templateName,
      });
      toast.success(`Template "${templateName}" saved`);
      setTemplateName('');
    } catch {
      toast.error('Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const typeLabel = curveType === 'nutritional' ? 'Courbes de Consignes — Nutrition' : 'Courbes de Consignes — Environnement';
  const typeColor = curveType === 'nutritional' ? 'var(--ok)' : 'var(--info)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-dim)',
        borderRadius: 'var(--radius) var(--radius) 0 0',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={typeColor} strokeWidth="1.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 14,
            fontWeight: 600, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--text-primary)',
          }}>
            {typeLabel}
          </span>
          {dirty && !readOnly && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--warn)', letterSpacing: '0.08em',
            }}>
              Unsaved changes
            </span>
          )}
        </div>

        {!readOnly && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Template name input + save */}
            <input
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder="Template name..."
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-dim)',
                color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
                fontSize: 12, padding: '5px 10px',
                borderRadius: 'var(--radius)', outline: 'none', width: 140,
              }}
            />
            <button
              onClick={handleSaveTemplate}
              disabled={savingTemplate}
              style={{
                padding: '5px 10px',
                fontFamily: 'var(--font-mono)', fontSize: 10,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                border: '1px solid var(--border-mid)',
                background: 'transparent', color: 'var(--text-dim)',
                cursor: 'pointer', borderRadius: 'var(--radius)',
              }}
            >
              Save as template
            </button>
            <button
              onClick={loadTemplate}
              style={{
                padding: '5px 10px',
                fontFamily: 'var(--font-mono)', fontSize: 10,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                border: '1px solid var(--border-mid)',
                background: 'transparent', color: 'var(--text-secondary)',
                cursor: 'pointer', borderRadius: 'var(--radius)',
              }}
            >
              Load template
            </button>
            {flockId && (
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                style={{
                  padding: '5px 14px',
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  border: `1px solid ${dirty ? typeColor : 'var(--border-dim)'}`,
                  background: dirty ? `${typeColor}18` : 'transparent',
                  color: dirty ? typeColor : 'var(--text-dim)',
                  cursor: saving || !dirty ? 'not-allowed' : 'pointer',
                  borderRadius: 'var(--radius)',
                  opacity: saving ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {saving ? 'Saving…' : 'Save & apply'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Template picker overlay */}
      {showTemplates && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 600,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
          onClick={() => setShowTemplates(false)}
        >
          <div className="panel" style={{ width: 400, padding: 0 }} onClick={e => e.stopPropagation()}>
            <div className="panel-header">
              <span className="panel-title">Select template</span>
              <button onClick={() => setShowTemplates(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {templates.length === 0 ? (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', padding: 20 }}>
                  No templates saved yet
                </div>
              ) : templates.map((t, i) => (
                <button key={i} onClick={() => applyTemplate(t)} style={{
                  padding: '10px 14px', textAlign: 'left',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-dim)',
                  color: 'var(--text-primary)', cursor: 'pointer', borderRadius: 'var(--radius)',
                  transition: 'all 0.12s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = typeColor}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-dim)'}
                >
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)', marginBottom: 2 }}>{t.template_name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                    {t.breed || 'All breeds'} · {t.checkpoints?.length} checkpoints
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main table */}
      <div style={{ overflowX: 'auto', background: 'var(--bg-panel)' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '6px', padding: '8px' }}>
          {/* Column headers */}
          <thead>
            <tr>
              {/* Day column */}
              <th style={{ padding: '6px 6px 10px', textAlign: 'center', minWidth: 80 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Jour</span>
                </div>
              </th>
              {columns.map((col, i) => (
                <th key={i} style={{ padding: '6px 6px 10px', textAlign: 'center', minWidth: 100 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    {col.icon && <col.icon size={16} color={col.color} strokeWidth={2} />}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: col.color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        {col.label}
                      </span>
                      {col.sublabel && (
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
                          {col.sublabel}
                        </span>
                      )}
                    </div>
                  </div>
                </th>
              ))}
              {/* Actions column */}
              {!readOnly && <th style={{ width: 32 }} />}
            </tr>
          </thead>

          <tbody>
            {/* Live setpoint row — shown when editing an active flock */}
            {ageDay != null && todaySetpoints && (
              <LiveSetpointRow
                todaySetpoints={todaySetpoints}
                columns={columns}
                ageDay={ageDay}
              />
            )}

            {/* Checkpoint rows */}
            {checkpoints.map((cp, rowIndex) => {
              const isPast    = ageDay != null && cp.day < ageDay;
              const isCurrent = ageDay != null && cp.day <= ageDay &&
                (checkpoints[rowIndex + 1]?.day > ageDay || rowIndex === checkpoints.length - 1);

              return (
                <tr
                  key={rowIndex}
                  className="fade-in"
                  style={{
                    animationDelay: `${rowIndex * 0.05}s`,
                    opacity: isPast && !isCurrent ? 0.55 : 1,
                  }}
                >
                  {/* Day label */}
                  <td style={{ padding: '4px 6px' }}>
                    <DayCell checkpoint={cp} isToday={isCurrent} />
                  </td>

                  {/* Data cells */}
                  {columns.map((col, colIndex) => (
                    <td key={colIndex} style={{ padding: '4px 6px' }}>
                      <div style={{ position: 'relative' }}>
                        <EditableCell
                          value={cp[col.key]}
                          unit={col.unit}
                          color={col.color}
                          readOnly={readOnly}
                          onChange={(val) => updateCell(rowIndex, col.key, val)}
                        />
                        <span style={{
                          position: 'absolute', bottom: 4, right: 6,
                          fontFamily: 'var(--font-mono)', fontSize: 8,
                          color: 'var(--text-dim)', opacity: 0.5,
                          pointerEvents: 'none',
                        }}>
                          J{cp.day}
                        </span>
                      </div>
                    </td>
                  ))}

                  {/* Remove row button */}
                  {!readOnly && (
                    <td style={{ padding: '4px 2px', width: 28 }}>
                      <button
                        onClick={() => removeRow(rowIndex)}
                        style={{
                          width: 26, height: 26, border: 'none',
                          background: 'transparent',
                          color: 'var(--text-dim)',
                          cursor: 'pointer', borderRadius: 'var(--radius)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16, lineHeight: 1,
                          transition: 'all 0.12s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-glow)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'transparent'; }}
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add row + footer */}
      {!readOnly && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px',
          background: 'var(--bg-elevated)',
          borderTop: '1px solid var(--border-dim)',
          borderRadius: '0 0 var(--radius) var(--radius)',
        }}>
          <button
            onClick={addRow}
            style={{
              padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              border: `1px solid ${typeColor}`,
              background: `${typeColor}12`, color: typeColor,
              cursor: 'pointer', borderRadius: 'var(--radius)',
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
            Add checkpoint
          </button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
            {checkpoints.length} checkpoints · click any cell to edit · Enter to confirm
          </span>
        </div>
      )}
    </div>
  );
}
