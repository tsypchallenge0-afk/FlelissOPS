import { useEffect, useState, useMemo, useRef } from 'react';
import { api } from '../lib/Api';
import TelemetryChart from '../components/TelemetryChart';
import CommandButton from '../components/CommandButton';
import { useWSSubscribe } from '../context/WSContext';
import EmptyState from '../components/EmptyState';
import Skeleton from '../components/Skeleton';
import './Dashboard.css';
import { usePredictions, usePredictionSummary } from '../hooks/usePredictions';
import HouseStatusBar from '../components/HouseStatusBar';
import SensorGrid from '../components/SensorGrid';
import ActuatorGrid from '../components/ActuatorGrid';
import { useHouseDevices } from '../hooks/useHouseDevices';
import { sentence } from '../lib/format';

const MAX_POINTS = 60;

const METRICS = [
  {
    key: 'temperature',
    label: 'Temperature',
    unit: '°C',
    color: '#e84040',
    warnThreshold: 35,
    dangerThreshold: 38,
  },
  {
    key: 'humidity',
    label: 'Humidity',
    unit: '%',
    color: '#20a0e8',
    warnThreshold: 70,
    dangerThreshold: 85,
  },
  {
    key: 'ammonia',
    label: 'Ammonia',
    unit: 'ppm',
    color: '#e8a020',
    warnThreshold: 20,
    dangerThreshold: 35,
  },
];

function getStatus(value, metric) {
  if (value >= metric.dangerThreshold) return 'danger';
  if (value >= metric.warnThreshold) return 'warn';
  return 'ok';
}

function StatCard({ metric, latest, pred }) {
  const value = latest?.[metric.key];
  const status = value != null ? getStatus(value, metric) : 'ok';

  // Progress bar calculation
  const progressRatio = value != null ? Math.min(value / (metric.dangerThreshold * 1.1), 1) : 0;
  const progressColor = `var(--${status})`;

  const aiBadge =
    pred?.available && pred?.will_breach_danger ? (
      <div
        style={{
          marginTop: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--danger)',
          backgroundColor: 'var(--danger-glow)',
          border: '1px solid rgba(232,58,32,0.25)',
          padding: '3px 8px',
          borderRadius: 'var(--radius)',
          letterSpacing: '0.05em',
          animation: 'pulse-dot 2s infinite',
        }}
      >
        DANGER in {pred.minutes_to_danger ?? '—'}min
      </div>
    ) : pred?.available && pred?.will_breach_warn ? (
      <div
        style={{
          marginTop: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--warn)',
          backgroundColor: 'var(--warn-glow)',
          border: '1px solid rgba(232,160,32,0.25)',
          padding: '3px 8px',
          borderRadius: 'var(--radius)',
          letterSpacing: '0.05em',
        }}
      >
        WARN in {pred.minutes_to_warn ?? '—'}min
      </div>
    ) : (
      <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ok)', opacity: 0.6 }}>
        AI: within limits
      </div>
    );

  return (
    <div className={`kpi-card panel ${status}`}>
      <div className="panel-header-highlight" />
      <div className="kpi-header">
        <span className="mono kpi-label">{metric.label}</span>
        <div className="kpi-status-badge">
          <span className={`status-dot ${status}`} />
          <span className={`mono kpi-status-text ${status}`}>{sentence(status)}</span>
        </div>
      </div>

      <div className={`kpi-value mono ${status}`}>
        {value != null ? value.toFixed(1) : '--'}
      </div>

      <div className="kpi-progress-container">
        <div
          className="kpi-progress-bar"
          style={{ width: `${progressRatio * 100}%`, backgroundColor: progressColor }}
        />
      </div>

      {aiBadge}

      <div className="kpi-reference-labels mono">
        <span>0</span>
        <span>Warn {metric.warnThreshold}</span>
        <span>Critical {metric.dangerThreshold}</span>
      </div>
    </div>
  );
}

function SelectedHouseDetail({ houseId }) {
  const { sensors, actuators, loading } = useHouseDevices(houseId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 10 }}>
       <div>
         <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 12 }}>
           // SENSOR READINGS
         </div>
         <SensorGrid sensors={sensors} loading={loading} />
       </div>
       
       <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 12 }}>
            // ACTUATOR STATUS
          </div>
          <ActuatorGrid actuators={actuators} loading={loading} />
       </div>
    </div>
  );
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [activeHouseId, setActiveHouseId] = useState(null);
  const deviceHouseCacheRef = useRef(new Map());

  const [houses, setHouses] = useState([]);
  const [selectedHouseId, setSelectedHouseId] = useState(null);

  useEffect(() => {
    api.getHouses?.()?.then(res => {
      setHouses(res);
      if (res?.length > 0) setSelectedHouseId(res[0].id || res[0].house_id || res[0]._id);
    });
  }, []);

  useEffect(() => {
    api.getTelemetry({ limit: MAX_POINTS })
      .then(rows => {
        const formatted = rows.slice(-MAX_POINTS).reverse().map(r => ({
          time: new Date(r.timestamp || Date.now()).toLocaleTimeString(),
          temperature: r.temperature,
          humidity: r.humidity,
          ammonia: r.ammonia,
          device_id: r.device_id,
        }));
        if (formatted.length) {
          setData(formatted);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    api.getAlerts({ status: 'active' })
      .then(res => {
        setAlerts(res || []);
      })
      .catch(console.error);
  }, []);

  useWSSubscribe('telemetry', (msg) => {
    const telemetryData = msg.data || msg;
    const now = new Date(telemetryData.timestamp || Date.now());

    const point = {
      time: now.toLocaleTimeString(),
      temperature: telemetryData.temperature,
      humidity: telemetryData.humidity,
      ammonia: telemetryData.ammonia,
      device_id: telemetryData.device_id,
    };

    setData(prev => {
      const prevData = prev.length ? prev : [];
      return [...prevData.slice(-(MAX_POINTS - 1)), point];
    });
  });

  useWSSubscribe('alert', (msg) => {
    const newAlerts = msg.alerts || [msg];
    setAlerts(prev => [...newAlerts, ...prev].slice(0, 50));
  });

  useWSSubscribe('alert_update', (msg) => {
    if (msg.status === 'acknowledged' || msg.status === 'resolved') {
      setAlerts(prev => prev.filter(a => a.id !== msg.alert_id));
    }
  });

  const ackAlert = async (id) => {
    await api.patchAlert(id, { status: 'acknowledged' });
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const latest = useMemo(() => (data.length ? data[data.length - 1] : null), [data]);

  useEffect(() => {
    const deviceId = latest?.device_id;
    if (!deviceId) return;

    if (deviceHouseCacheRef.current.has(deviceId)) {
      setActiveHouseId(deviceHouseCacheRef.current.get(deviceId));
      return;
    }

    api.getDevice(deviceId)
      .then(dev => {
        const hid = dev?.house_id ?? dev?.houseId ?? null;
        deviceHouseCacheRef.current.set(deviceId, hid);
        setActiveHouseId(hid);
      })
      .catch(() => {
        deviceHouseCacheRef.current.set(deviceId, null);
        setActiveHouseId(null);
      });
  }, [latest?.device_id]);

  const { riskLevel: globalRisk } = usePredictionSummary(activeHouseId);
  const { predictions, anomalies } = usePredictions(activeHouseId);

  const chartDataWithForecast = useMemo(() => {
    if (!data?.length) return [];
    const base = data.map(d => ({ ...d, is_forecast: false }));

    const tempF = predictions?.predictions?.temperature?.forecast ?? [];
    const humF = predictions?.predictions?.humidity?.forecast ?? [];
    const nh3F = predictions?.predictions?.ammonia?.forecast ?? [];
    
    const maxLen = Math.max(tempF.length, humF.length, nh3F.length);
    if (maxLen === 0) return base;

    for (let i = 0; i < maxLen; i++) {
      const ts = tempF[i]?.timestamp || humF[i]?.timestamp || nh3F[i]?.timestamp;
      base.push({
        time: ts ? new Date(ts).toLocaleTimeString() : '',
        temperature: null,
        humidity: null,
        ammonia: null,
        temperature_forecast: tempF[i]?.value ?? null,
        humidity_forecast: humF[i]?.value ?? null,
        ammonia_forecast: nh3F[i]?.value ?? null,
        is_forecast: true,
      });
    }

    return base;
  }, [data, predictions]);

  return (
    <div className="dashboard page-enter flex flex-col gap-5 h-full">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title condensed">Dashboard</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="section-label">Real-time KPI metrics</div>
            {globalRisk && globalRisk !== 'NORMAL' && (
              <span
                className={`status-badge ${['CRITICAL', 'HIGH'].includes(globalRisk) ? 'danger' : 'warn'}`}
                style={{ marginLeft: 8 }}
              >
                AI RISK: {globalRisk}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {houses.map(house => (
          <HouseStatusBar 
            key={house.id || house._id || house.house_id}
            house={house}
            selected={selectedHouseId === (house.id || house._id || house.house_id)}
            onSelect={() => setSelectedHouseId(house.id || house._id || house.house_id)}
          />
        ))}
      </div>

      {selectedHouseId && (
         <SelectedHouseDetail houseId={selectedHouseId} />
      )}

      <div className="dashboard-content stagger" style={{ flex: 1, minHeight: 0 }}>
        <div className="chart-wrapper panel flex flex-col h-full">
          {data.length === 0 && loading ? (
            <div style={{ height: '100%', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton height={160} />
              <div style={{ display: 'flex', gap: 8 }}>
                <Skeleton height={10} width={80} />
                <Skeleton height={10} width={80} />
                <Skeleton height={10} width={80} />
              </div>
            </div>
          ) : (
            <>
              <TelemetryChart data={chartDataWithForecast} metrics={METRICS} anomalies={anomalies} />
              {predictions?.predictions && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px 10px' }}>
                  <div style={{ width: 20, height: 0, borderTop: '2px dashed var(--text-dim)', opacity: 0.6 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                    FORECAST ({predictions.active_tiers?.prophet ? 'Prophet' : 'Trend'})
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="alerts-panel panel flex flex-col h-full">
          <div className="alerts-header flex-shrink-0">
            <span className="alerts-title condensed">
              <span style={{ color: 'var(--danger)' }}>◈</span> Active alerts
            </span>
            <span className="alerts-badge mono">{alerts.length}</span>
          </div>

          <div className="alerts-list overflow-y-auto flex-1">
            {alerts.length === 0 && !loading ? (
              <EmptyState icon="check" title="All clear" subtitle="No threshold violations detected" color="var(--ok)" />
            ) : (
              alerts.map(a => {
                const sevLevel = a.severity || (a.type === 'CRITICAL' ? 'danger' : 'warn');
                return (
                  <div key={a.id} className={`alert-card ${sevLevel}`} style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="alert-card-header mono">
                      <span className={`alert-severity ${sevLevel}`}>{sentence(String(a.severity || a.type))}</span>
                      <span className="alert-metric-label">{a.metric}</span>
                      <span className="alert-time">{a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '—'}</span>
                    </div>
                    <div className="alert-card-rule mono">
                      {a.metric} = {a.value?.toFixed(1)}
                    </div>
                    <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                      <CommandButton label="Acknowledge" variant="ghost" style={{ fontSize: '10px', padding: '2px 8px' }} onExecute={() => ackAlert(a.id)} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}