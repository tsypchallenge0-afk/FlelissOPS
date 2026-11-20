import { useEffect, useState, useMemo } from 'react';
import CommandButton from '../components/CommandButton';
import { useWSSubscribe } from '../context/WSContext';
import { api } from '../lib/Api';
import './Alerts.css';

const TYPE_META = {
  temperature: { label: 'Temp', color: '#e84040' },
  humidity: { label: 'Hum', color: '#20a0e8' },
  ammonia: { label: 'NH₃', color: '#e8a020' },
};

function getSeverity(severity) {
  const s = String(severity || 'warning').toLowerCase();
  if (s === 'critical' || s === 'danger') return 'CRITICAL';
  if (s === 'info') return 'INFO';
  return 'WARNING';
}

function getIcon(severity) {
  if (severity === 'CRITICAL') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  );
}

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState('ALL');
  const [sevFilter, setSevFilter] = useState('ALL');
  const [selectedRow, setSelectedRow] = useState(null);

  useEffect(() => {
    api.getAlerts({ status: 'active' })
      .then((list) => setAlerts(list || []))
      .catch(() => {
        setAlerts([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useWSSubscribe('alert', (msg) => {
    setAlerts(prev => [msg, ...prev]);
  });

  useWSSubscribe('alert_update', (msg) => {
    if (msg.status === 'acknowledged' || msg.status === 'resolved') {
      setAlerts(prev => prev.filter(a => a.id !== msg.alert_id));
    }
  });

  const ackAlert = async (id, e) => {
    e.stopPropagation();
    await api.patchAlert(id, { status: 'acknowledged' });
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const counts = useMemo(() => {
    return {
      CRITICAL: alerts.filter(a => getSeverity(a.severity) === 'CRITICAL').length,
      WARNING: alerts.filter(a => getSeverity(a.severity) === 'WARNING').length,
      INFO: alerts.filter(a => getSeverity(a.severity) === 'INFO').length,
    };
  }, [alerts]);

  const filtered = useMemo(() => {
    return alerts.filter(a => {
      const type = String(a.metric || a.type || '').toLowerCase();
      const meta = TYPE_META[type] || { label: 'Unknown' };
      const sev = getSeverity(a.severity);

      const typeMatch = typeFilter === 'ALL' || meta.label === typeFilter;
      const sevMatch = sevFilter === 'ALL' || sev === sevFilter;

      return typeMatch && sevMatch;
    });
  }, [alerts, typeFilter, sevFilter]);

  return (
    <div className="alerts-page page-enter flex flex-col h-full gap-5">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title condensed">Alert log</h1>
          <div className="section-label">System events · anomaly tracking</div>
        </div>
      </div>

      {/* 3-column Severity Tiles */}
      <div className="severity-tiles stagger">
        {['CRITICAL', 'WARNING', 'INFO'].map(sev => {
          const isActive = sevFilter === sev;
          const count = counts[sev] || 0;
          const sevClass = sev === 'CRITICAL' ? 'danger' : sev === 'WARNING' ? 'warn' : 'info';

          return (
            <div
              key={sev}
              className={`severity-tile panel ${isActive ? 'active' : ''} ${sevClass}`}
              onClick={() => setSevFilter(isActive ? 'ALL' : sev)}
            >
              <div className="severity-tile-content">
                <div className="section-label">{sev}</div>
                <div className="severity-tile-value mono">{count}</div>
              </div>
              <div className={`severity-icon-box ${sevClass}`}>
                {getIcon(sev)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Type Filter Bar */}
      <div className="filter-bar stagger">
        <span className="section-label" style={{ marginRight: 8 }}>Metric:</span>
        <div className="pill-buttons">
          {['ALL', 'Temp', 'Hum', 'NH₃'].map(t => (
            <button
              key={t}
              className={`pill-btn mono ${typeFilter === t ? 'active' : ''} ${typeFilter === t && t !== 'ALL' ? t.toLowerCase() : ''}`}
              onClick={() => setTypeFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="record-count mono">
          {filtered.length} events
        </div>
      </div>

      {/* Alert Table */}
      <div className="alert-table-panel panel stagger" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div className="table-loading mono" style={{ flex: 1 }}>Loading event log...</div>
        ) : (
          <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
            <table className="device-table">
              <thead>
                <tr>
                  <th className="section-label text-center" style={{ width: 70 }}>Seq</th>
                  <th className="section-label">Timestamp</th>
                  <th className="section-label">Location</th>
                  <th className="section-label">Type</th>
                  <th className="section-label">Severity</th>
                  <th className="section-label text-right">Value</th>
                  <th className="section-label">Message</th>
                  <th className="section-label text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-empty section-label">No active events found</td>
                  </tr>
                ) : (
                  filtered.map((a, i) => {
                    const type = String(a.metric || a.type || 'unknown').toLowerCase();
                    const meta = TYPE_META[type] || { label: 'SYS', color: 'var(--text-dim)' };
                    const sev = getSeverity(a.severity);
                    const sevClass = sev === 'CRITICAL' ? 'danger' : sev === 'WARNING' ? 'warn' : 'info';

                    const d = new Date(a.created_at || a.timestamp || new Date());
                    const dateStr = d.toLocaleDateString();
                    const timeStr = d.toLocaleTimeString();

                    return (
                      <tr
                        key={a.id || i}
                        className={`alert-row-item ${selectedRow === i ? 'selected' : ''}`}
                        onClick={() => setSelectedRow(i)}
                      >
                        <td className="mono dim text-center">{String(a.id || i).substring(0, 6)}</td>
                        <td>
                          <div className="stacked-time">
                            <span className="mono font-bold" style={{ color: 'var(--text-primary)' }}>{timeStr}</span>
                            <span className="mono dim" style={{ fontSize: 10 }}>{dateStr}</span>
                          </div>
                        </td>
                        <td className="mono text-secondary">
                          {a.farm_id} / {a.house_id}
                        </td>
                        <td>
                          <div
                            className="metric-badge mono"
                            style={{
                              color: meta.color,
                              backgroundColor: `${meta.color}15`,
                              border: `1px solid ${meta.color}30`
                            }}
                          >
                            {meta.label}
                          </div>
                        </td>
                        <td>
                          <div className={`table-status-badge ${sevClass}`}>
                            <span className={`status-dot ${sevClass}`} style={{ width: 6, height: 6 }} />
                            <span className="mono">{sev}</span>
                          </div>
                        </td>
                        <td className="mono text-right font-bold" style={{ color: meta.color }}>
                          {a.value != null ? Number(a.value).toFixed(2) : '—'}
                          {a.threshold && <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginLeft: '4px' }}>(&gt; {a.threshold})</span>}
                        </td>
                        <td className="msg-cell text-secondary">
                          {a.message || 'Threshold exceeded'}
                        </td>
                        <td className="text-right">
                          <CommandButton
                            label="Ack"
                            variant="ghost"
                            style={{ fontSize: '11px', padding: '2px 8px' }}
                            onExecute={(e) => ackAlert(a.id, e)}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}