import { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/Api';
import CommandButton from '../components/CommandButton';
import Skeleton from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import PositionSelector from '../components/PositionSelector';
import './Devices.css';
import { sentence } from '../lib/format';

function statusDotClass(status) {
  if (!status) return 'offline';
  const s = String(status).toLowerCase();
  if (s === 'online' || s === 'active' || s === 'ok') return 'ok';
  if (s === 'warning' || s === 'warn') return 'warn';
  if (s === 'offline' || s === 'inactive' || s === 'danger' || s === 'maintenance') return 'danger';
  return 'ok';
}

function getUptime(lastPingStr) {
  if (!lastPingStr) return { text: '—', color: 'var(--text-dim)' };
  const pingTime = new Date(lastPingStr).getTime();
  const now = Date.now();
  const diffMs = now - pingTime;

  if (isNaN(diffMs) || diffMs < 0) return { text: '1s ago', color: 'var(--ok)' };

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return { text: `${diffSec}s ago`, color: 'var(--ok)' };

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return { text: `${diffMin}m ago`, color: diffMin < 5 ? 'var(--ok)' : 'var(--warn)' };
  }

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return { text: `${diffHr}h ago`, color: 'var(--danger)' };
  }

  const diffDay = Math.floor(diffHr / 24);
  return { text: `${diffDay}d ago`, color: 'var(--danger)' };
}

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter dropdown state
  const [farms, setFarms] = useState([]);
  const [houses, setHouses] = useState([]);
  const [selectedFarm, setSelectedFarm] = useState('ALL');
  const [selectedHouse, setSelectedHouse] = useState('ALL');

  // Position editing state
  const [editingDevice, setEditingDevice] = useState(null);
  const [editingPosition, setEditingPosition] = useState('');

  const fetchFarms = () => {
    api.getFarms().then(setFarms).catch(err => console.error("Failed to fetch farms", err));
  };

  const fetchHouses = (farmId) => {
    if (farmId === 'ALL') {
      setHouses([]);
      setSelectedHouse('ALL');
      return;
    }
    api.getFarmHouses(farmId).then(setHouses).catch(err => console.error("Failed to fetch houses", err));
  };

  const fetchDevices = () => {
    api.getDevices()
      .then((devList) => {
        setDevices(devList);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDevices();
    fetchFarms();
  }, []);

  useEffect(() => {
    fetchHouses(selectedFarm);
    setSelectedHouse('ALL'); // Reset house when farm changes
  }, [selectedFarm]);

  const handleAction = async (deviceId, action) => {
    setLoading(true);
    if (action === 'reboot') {
      await api.rebootDevice(deviceId, {});
    } else if (action === 'maintenance') {
      await api.patchDevice(deviceId, { status: 'maintenance' });
    }
    fetchDevices();
  };

  const handleCheckConnectivity = async (deviceId) => {
    try {
      const result = await api.checkDeviceConnectivity(deviceId);
      const isOnline = result.status === 'online';
      // Find and update the device in state
      setDevices(prev => prev.map(d => 
        d.id === deviceId ? { ...d, status: isOnline ? 'online' : 'offline', last_seen: result.last_seen } : d
      ));
      alert(`Device is ${sentence(result.status)}${result.seconds_since_last_seen !== undefined ? ` (Last seen ${result.seconds_since_last_seen}s ago)` : ''}`);
    } catch (err) {
      console.error("Check failed", err);
      alert("Connection check failed");
    }
  };

  const handleDelete = async (deviceId) => {
    if (!window.confirm("Are you sure you want to delete this device? This action cannot be undone.")) return;
    try {
      await api.deleteDevice(deviceId);
      fetchDevices();
    } catch (err) {
      console.error("Delete failed", err);
      alert("Failed to delete device");
    }
  };

  const handleUpdatePosition = async () => {
    if (!editingDevice) return;
    setLoading(true);
    try {
      await api.patchDevice(editingDevice.id, { position: editingPosition });
      setEditingDevice(null);
      fetchDevices();
    } catch (_e) {
      setError('Failed to update position');
      setLoading(false);
    }
  };

  const counts = useMemo(() => {
    return {
      TOTAL: devices.length,
      ONLINE: devices.filter(d => statusDotClass(d.status) === 'ok').length,
      WARNING: devices.filter(d => statusDotClass(d.status) === 'warn').length,
      OFFLINE: devices.filter(d => statusDotClass(d.status) === 'offline' || statusDotClass(d.status) === 'danger').length,
    };
  }, [devices]);

  const filteredDevices = useMemo(() => {
    return devices.filter(d => {
      // Farm filter
      if (selectedFarm !== 'ALL') {
        if (d.farm_id !== selectedFarm) return false;
      }

      // House filter
      if (selectedHouse !== 'ALL') {
        const hId = d.house_id || d.houseId;
        if (hId !== selectedHouse) return false;
      }

      // Status filter
      if (activeFilter !== 'ALL') {
        const sc = statusDotClass(d.status);
        if (activeFilter === 'ONLINE' && sc !== 'ok') return false;
        if (activeFilter === 'WARNING' && sc !== 'warn') return false;
        if (activeFilter === 'OFFLINE' && sc !== 'offline' && sc !== 'danger') return false;
      }

      // Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const idMatch = (d.id || d.device_id || '').toLowerCase().includes(q);
        const houseMatch = (d.house_code || d.house_id || d.houseId || '').toLowerCase().includes(q);
        const farmMatch = (d.farm_name || d.farm_id || '').toLowerCase().includes(q);
        if (!idMatch && !houseMatch && !farmMatch) return false;
      }
      return true;
    });
  }, [devices, activeFilter, searchQuery, selectedFarm, selectedHouse]);

  return (
    <div className="devices-page page-enter flex flex-col h-full gap-5">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title condensed">Device registry</h1>
          <div className="section-label">Tracking modules · sensor nodes</div>
        </div>
      </div>

      {editingDevice && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.45)'
        }}>
          <div className="panel" style={{ width: 400, padding: 20 }}>
            <h3 className="mono" style={{ marginBottom: 15, fontSize: 13, fontWeight: 'bold' }}>
              Reposition device
            </h3>
            <div className="mono dim" style={{ marginBottom: 20, fontSize: 11 }}>
              Target: {editingDevice.name}
            </div>
            <PositionSelector
              value={editingPosition}
              onChange={setEditingPosition}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 15 }}>
              <button
                className="pill-btn mono"
                onClick={() => setEditingDevice(null)}
              >
                Cancel
              </button>
              <button
                className="pill-btn mono active"
                onClick={handleUpdatePosition}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4-Column Stat Tiles */}
      <div className="stat-tiles-row stagger">
        {['TOTAL', 'ONLINE', 'WARNING', 'OFFLINE'].map((statusKey) => {
          const isActive = activeFilter === statusKey;
          const count = counts[statusKey] || 0;
          let colorClass = 'neutral';
          if (statusKey === 'ONLINE') colorClass = 'ok';
          if (statusKey === 'WARNING') colorClass = 'warn';
          if (statusKey === 'OFFLINE') colorClass = 'danger';
          if (statusKey === 'TOTAL') colorClass = 'neutral';

          return (
            <div
              key={statusKey}
              className={`stat-tile panel ${colorClass} ${isActive ? 'active' : ''}`}
              onClick={() => setActiveFilter(statusKey)}
            >
              <div className="section-label">
                {statusKey === 'TOTAL' ? 'Total devices' : statusKey}
              </div>
              <div className="stat-tile-value mono">{count}</div>
            </div>
          );
        })}
      </div>

      {/* Filter Bar */}
      <div className="filter-bar stagger">
        <div className="pill-buttons">
          {['ALL', 'ONLINE', 'WARNING', 'OFFLINE'].map(f => (
            <button
              key={f}
              className={`pill-btn mono ${activeFilter === f ? 'active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Farm Filter Dropdown */}
          <div style={{ position: 'relative' }}>
             <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.1em' }}>Farm browser</div>
             <select 
               className="mono"
               style={{ 
                 backgroundColor: 'var(--bg-surface)', 
                 color: 'var(--text-primary)', 
                 border: '1px solid var(--border-mid)',
                 padding: '8px 32px 8px 12px',
                 borderRadius: '8px',
                 fontSize: '11px',
                 appearance: 'none',
                 cursor: 'pointer',
                 minWidth: '160px',
                 boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
               }}
               value={selectedFarm}
               onChange={(e) => setSelectedFarm(e.target.value)}
             >
               <option value="ALL">All farms</option>
               {farms.map(f => (
                 <option key={f.id} value={f.id}>{sentence(f.name)}</option>
               ))}
             </select>
             <div style={{ position: 'absolute', right: 10, top: 28, pointerEvents: 'none', color: 'var(--text-dim)', fontSize: 10 }}>▼</div>
          </div>

          {/* House Filter Dropdown */}
          <div style={{ position: 'relative', opacity: selectedFarm === 'ALL' ? 0.4 : 1, transition: 'opacity 0.3s' }}>
             <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.1em' }}>House sector</div>
             <select 
               className="mono"
               style={{ 
                 backgroundColor: 'var(--bg-surface)', 
                 color: 'var(--text-primary)', 
                 border: '1px solid var(--border-mid)',
                 padding: '8px 32px 8px 12px',
                 borderRadius: '8px',
                 fontSize: '11px',
                 appearance: 'none',
                 cursor: 'pointer',
                 minWidth: '140px',
                 boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
               }}
               value={selectedHouse}
               onChange={(e) => setSelectedHouse(e.target.value)}
               disabled={selectedFarm === 'ALL'}
             >
               <option value="ALL">All houses</option>
               {houses.map(h => (
                 <option key={h.id} value={h.id}>{h.house_code}</option>
               ))}
             </select>
             <div style={{ position: 'absolute', right: 10, top: 28, pointerEvents: 'none', color: 'var(--text-dim)', fontSize: 10 }}>▼</div>
          </div>
        </div>

        <div className="search-wrapper">
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            className="search-input mono"
            placeholder="Search device or house code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="record-count mono">
          {filteredDevices.length} records
        </div>
      </div>

      <div className="device-table-panel panel stagger" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <table className="device-table" style={{ width: '100%' }}>
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {[40, 120, 80, 90, 70, 80, 80, 60].map((w, j) => (
                    <td key={j} style={{ padding: '12px 16px' }}>
                      <Skeleton height={12} width={w} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : error && devices.length === 0 ? (
          <div className="table-error mono" style={{ flex: 1 }}>{error}</div>
        ) : filteredDevices.length === 0 ? (
          <EmptyState
            icon="search"
            title="No devices found"
            subtitle={searchQuery ? `No results for "${searchQuery}"` : 'No devices match the current filter'}
            action={{ label: 'Clear filter', onClick: () => { setSearchQuery(''); setActiveFilter('ALL'); } }}
          />
        ) : (
          <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
            <table className="device-table">
              <thead>
                <tr>
                  <th className="section-label" style={{ width: '60px', textAlign: 'center' }}>#</th>
                  <th className="section-label">Device ID</th>
                  <th className="section-label">House code</th>
                  <th className="section-label">Type</th>
                  <th className="section-label">Position</th>
                  <th className="section-label">Status</th>
                  <th className="section-label">Last seen</th>
                  <th className="section-label text-right">Uptime</th>
                  <th className="section-label text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                  {filteredDevices.map((d, i) => {
                    const dotClass = statusDotClass(d.status);
                    const uptime = getUptime(d.last_seen || d.lastPing);
                    const lastSeenDate = d.last_seen || d.lastPing
                      ? new Date(d.last_seen || d.lastPing).toLocaleTimeString()
                      : '—';

                    return (
                      <tr key={d.device_id || d.id || i}>
                        <td className="mono dim text-center">{(i + 1).toString().padStart(2, '0')}</td>
                        <td className="mono text-primary font-bold">{d.name || d.device_id || d.id || `DEV-${String(i + 1).padStart(3, '0')}`}</td>
                        <td className="mono text-secondary">{d.house_code || d.house_id || d.houseId || '—'}</td>
                        <td className="mono dim">{d.type || d.device_type || 'Unknown'}</td>
                        <td className="mono dim">{d.position || 'Middle-Center'}</td>
                        <td>
                          <div className={`table-status-badge ${dotClass}`}>
                            <span className={`status-dot ${dotClass}`} style={{ width: 6, height: 6 }} />
                            <span className="mono">{sentence(String(d.status || 'ONLINE'))}</span>
                          </div>
                        </td>
                        <td className="mono dim">{lastSeenDate}</td>
                        <td className="mono text-right font-bold" style={{ color: uptime.color }}>
                          {uptime.text}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                            <CommandButton
                              label="✎"
                              variant="ghost"
                              title="Reposition"
                              style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--accent)' }}
                              onExecute={() => {
                                setEditingDevice(d);
                                setEditingPosition(d.position || 'Middle-Center');
                              }}
                            />
                            <CommandButton
                              label="⟳"
                              variant="ghost"
                              title="Reboot"
                              style={{ padding: '2px 8px', fontSize: '11px' }}
                              onExecute={() => handleAction(d.id, 'reboot')}
                            />
                            <CommandButton
                              label="📡"
                              variant="ghost"
                              title="Check Connectivity"
                              style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--ok)' }}
                              onExecute={() => handleCheckConnectivity(d.id)}
                            />
                            <CommandButton
                              label="🔧"
                              variant="ghost"
                              title="Maintenance Mode"
                              style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--warn)' }}
                              onExecute={() => handleAction(d.id, 'maintenance')}
                            />
                            <CommandButton
                              label="🗑️"
                              variant="ghost"
                              title="Delete Device"
                              style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--danger)' }}
                              onExecute={() => handleDelete(d.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}