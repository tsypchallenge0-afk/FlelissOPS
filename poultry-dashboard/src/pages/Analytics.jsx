import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { 
  BarChart3, FileText, Download, Filter, 
  Calendar, Info, AlertTriangle, TrendingUp, TrendingDown, Bot
} from 'lucide-react';
import { api } from '../lib/Api';
import AIActionHistory from '../components/AIActionHistory';
import './Analytics.css';
import { sentence } from '../lib/format';

const COLORS = ['var(--accent)', 'var(--info)', 'var(--ok)', 'var(--warn)', 'var(--danger)'];

export default function Analytics() {
  const [activeTab, setActiveTab] = useState('overview');
  const [windowDays, setWindowDays] = useState(30);
  const [farmsData, setFarmsData] = useState([]);
  const [farmsList, setFarmsList] = useState([]);
  const [selectedFarm, setSelectedFarm] = useState('all');
  const [efficiency, setEfficiency] = useState(null);
  const [patterns, setPatterns] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      try {
        const [fList, fComp] = await Promise.all([
          api.getFarms(),
          api.getFarmsComparison(windowDays)
        ]);
        setFarmsList(fList);
        setFarmsData(fComp);
      } catch (err) {
        console.error("Failed to load analytics data", err);
      } finally {
        setLoading(false);
      }
    };
    loadInitial();
  }, [windowDays]);

  useEffect(() => {
    const loadTabData = async () => {
      if (activeTab === 'efficiency') {
        const data = await api.getEfficiency(selectedFarm === 'all' ? null : selectedFarm, windowDays);
        setEfficiency(data);
      } else if (activeTab === 'patterns') {
        const data = await api.getAlertPatterns(selectedFarm === 'all' ? null : selectedFarm, windowDays);
        setPatterns(data);
      } else if (activeTab === 'reports') {
        const data = await api.getReportSchedules();
        setSchedules(data);
      }
    };
    loadTabData();
  }, [activeTab, selectedFarm, windowDays]);

  const handleDownloadReport = async () => {
    try {
      const farmId = selectedFarm === 'all' ? farmsList[0]?.id : selectedFarm;
      if (!farmId) return;
      const blob = await api.downloadReport(farmId, windowDays);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Report_${farmId}_${new Date().toISOString().split('T')[0]}.pdf`);
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      console.error("Download failed", err);
    }
  };

  // Overview KPIs, all computed from /analytics/farms/comparison (no placeholder numbers)
  const overviewKPIs = useMemo(() => {
    if (!farmsData.length) return [];
    const sum = (k) => farmsData.reduce((acc, f) => acc + (f[k] || 0), 0);
    const withTemp = farmsData.filter(f => f.avg_temperature != null && f.reading_count > 0);
    const avgTemp = withTemp.length
      ? withTemp.reduce((a, f) => a + f.avg_temperature * f.reading_count, 0) / sum('reading_count')
      : null;
    const placed = sum('birds_placed'), dead = sum('birds_dead');
    const devices = sum('device_count'), online = sum('devices_online');
    const cmds = sum('total_commands'), aiCmds = sum('ai_commands');
    return [
      { label: 'Avg House Temp', value: avgTemp == null ? '—' : `${avgTemp.toFixed(1)}°C`,
        note: `${sum('reading_count').toLocaleString()} readings · ${windowDays}d`, icon: <TrendingUp size={14} /> },
      { label: 'Flock Mortality', value: placed ? `${(dead / placed * 100).toFixed(2)}%` : '—',
        note: placed ? `${dead.toLocaleString()} of ${placed.toLocaleString()} birds (active flocks)` : 'No active flocks',
        icon: <TrendingDown size={14} />, positive: placed ? dead / placed * 100 < 3 : true },
      { label: 'Devices Online', value: `${online}/${devices}`,
        note: devices ? `${Math.round(online / devices * 100)}% reporting in the last 15 min` : 'No devices registered',
        icon: <TrendingUp size={14} />, positive: devices > 0 && online === devices },
      { label: 'AI Automation', value: cmds ? `${Math.round(aiCmds / cmds * 100)}%` : '—',
        note: cmds ? `${aiCmds.toLocaleString()} of ${cmds.toLocaleString()} control commands` : 'No control commands yet',
        icon: <TrendingUp size={14} />, positive: true },
    ];
  }, [farmsData, windowDays]);

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <div>
          <div className="page-title condensed">Business Intelligence</div>
          <div className="page-subtitle">// ANALYTICAL OVERVIEW · {windowDays} DAY WINDOW</div>
        </div>

        <div className="analytics-filters">
          <div className="analytics-tabs">
            {[
              { id: 'overview', label: 'Overview', icon: <BarChart3 size={14} /> },
              { id: 'efficiency', label: 'Efficiency', icon: <TrendingUp size={14} /> },
              { id: 'patterns', label: 'Alert Patterns', icon: <AlertTriangle size={14} /> },
              { id: 'ai_insights', label: 'AI Insights', icon: <Bot size={14} /> },
              { id: 'reports', label: 'Reports', icon: <FileText size={14} /> },
            ].map(tab => (
              <button 
                key={tab.id}
                className={`analytics-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <select
            className="analytics-select"
            value={selectedFarm}
            onChange={(e) => setSelectedFarm(e.target.value)}
            aria-label="Farm"
          >
            <option value="all">All farms</option>
            {farmsList.map(f => (
              <option key={f.id ?? f._id} value={f.id ?? f._id}>{f.name}</option>
            ))}
          </select>

          <select
            className="analytics-select"
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>
          
          <button className="analytics-btn" onClick={handleDownloadReport}>
            <Download size={16} />
            Export PDF
          </button>
        </div>
      </div>

      <div className="analytics-content">
        {loading ? (
          <div className="analytics-loader" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px', width: '100%' }}>
            <div className="mono-text" style={{ color: 'var(--accent)' }}>Initializing analytical core...</div>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <>
                <div className="analytics-kpi-row">
                  {overviewKPIs.map((kpi, i) => (
                    <div key={i} className="analytics-kpi-card fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                      <div className="analytics-kpi-lbl">{kpi.label}</div>
                      <div className="analytics-kpi-val">{kpi.value}</div>
                      <div className={`analytics-kpi-trend ${kpi.positive ? 'trend-up' : 'trend-down'}`}>
                        {kpi.icon} {kpi.note}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="chart-grid">
                  <div className="analytics-chart-card fade-in">
                    <div className="analytics-chart-title">Farm Performance Comparison</div>
                    <div style={{ flex: 1, width: '100%', minWidth: 300, minHeight: 300 }}>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={farmsData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" vertical={false} />
                          <XAxis dataKey="name" stroke="var(--text-dim)" fontSize={12} />
                          <YAxis stroke="var(--text-dim)" fontSize={12} />
                          <Tooltip 
                            contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border-dim)', borderRadius: '4px' }}
                            itemStyle={{ color: 'var(--text-primary)', fontSize: '12px' }}
                          />
                          <Bar dataKey="avg_temperature" name="Avg Temp (°C)" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="avg_humidity" name="Avg Humidity (%)" fill="var(--info)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="analytics-chart-card fade-in">
                    <div className="analytics-chart-title">Flock Mortality by Farm (%)</div>
                    <div style={{ flex: 1, width: '100%', minWidth: 300, minHeight: 300 }}>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={farmsData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" vertical={false} />
                          <XAxis dataKey="name" stroke="var(--text-dim)" fontSize={12} />
                          <YAxis stroke="var(--text-dim)" fontSize={12} unit="%" />
                          <Tooltip
                            contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border-dim)' }}
                            formatter={(v) => (v == null ? 'no active flock' : `${v}%`)}
                          />
                          <Bar dataKey="avg_mortality" name="Cumulative mortality" fill="var(--danger)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'efficiency' && (
              <div className="analytics-chart-card fade-in full">
                <div className="analytics-chart-title">Resource Efficiency Index</div>
                {efficiency ? (
                  <div style={{ flex: 1, width: '100%', minWidth: 300, minHeight: 400 }}>
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={efficiency.daily}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" vertical={false} />
                        <XAxis dataKey="date" stroke="var(--text-dim)" fontSize={11} />
                        <YAxis stroke="var(--text-dim)" fontSize={11} />
                        <Tooltip contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border-dim)' }} />
                        <Legend verticalAlign="top" height={36}/>
                        <Line type="monotone" dataKey="feed_efficiency" name="Feed Conversion" stroke="var(--accent)" strokeWidth={3} dot={false} />
                        <Line type="monotone" dataKey="energy_efficiency" name="Energy Savings" stroke="var(--info)" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="empty-reports">Loading efficiency data...</div>
                )}
              </div>
            )}

            {activeTab === 'patterns' && (
              <div className="chart-grid">
                <div className="analytics-chart-card fade-in">
                  <div className="analytics-chart-title">Alert Frequency by Metric</div>
                  {patterns ? (
                    <div style={{ flex: 1, width: '100%', minWidth: 300, minHeight: 300 }}>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={Object.entries(patterns.by_metric).map(([name, value]) => ({ name, value }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {Object.entries(patterns.by_metric).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="empty-reports">Analyzing patterns...</div>
                  )}
                </div>

                <div className="analytics-chart-card fade-in">
                  <div className="analytics-chart-title">Alert Heatmap (24h)</div>
                  {patterns ? (
                    <div style={{ flex: 1, width: '100%', minWidth: 300, minHeight: 300 }}>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={Object.entries(patterns.by_hour).map(([hour, count]) => ({ hour, count }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" vertical={false} />
                          <XAxis dataKey="hour" stroke="var(--text-dim)" fontSize={10} />
                          <YAxis stroke="var(--text-dim)" fontSize={10} />
                          <Tooltip />
                          <Bar dataKey="count" fill="var(--danger)" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="empty-reports">Generating heatmap...</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'ai_insights' && (
              <div className="analytics-chart-card fade-in full" style={{ minHeight: '600px' }}>
                <AIActionHistory />
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="analytics-table-wrapper fade-in">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Report Name</th>
                      <th>Frequency</th>
                      <th>Target Recipients</th>
                      <th>Last Generated</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.length === 0 ? (
                      <tr>
                        <td colSpan="6">
                          <div className="empty-reports">No report schedules configured. system operating on manual export mode.</div>
                        </td>
                      </tr>
                    ) : (
                      schedules.map(s => (
                        <tr key={s.id}>
                          <td>{s.name}</td>
                          <td>{sentence(s.frequency)}</td>
                          <td>{s.recipients.join(', ')}</td>
                          <td>{s.last_run || 'Never'}</td>
                          <td><span className="status-badge ok">Active</span></td>
                          <td><button className="btn btn-ghost" style={{ fontSize: 10 }}>Edit</button></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}