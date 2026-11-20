import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/Api';
import { sentence } from '../../lib/format';

export default function SuperDashboard() {
  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.getPlatformStats(), api.getTenants()])
      .then(([s, t]) => { setStats(s); setTenants(t); })
      .finally(() => setLoading(false));
  }, []);

  const getPlanColor = (plan) => {
    const colors = {
      trial: 'var(--text-dim)',
      standard: 'var(--ok)',
      professional: 'var(--accent)',
      enterprise: '#a855f7',
      custom: '#0ea5e9'
    };
    return colors[plan] || 'var(--text-secondary)';
  };

  if (loading) return <div style={{ padding: 40, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>Initializing command center...</div>;

  return (
    <div className="page" style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 40, maxWidth: 1600, margin: '0 auto' }}>
      
      {/* Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.2em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 40, height: 1, background: 'var(--accent)' }} /> 
            Core systems overwatch
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 42, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Command center</h1>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
           <button className="btn btn-ghost" onClick={() => navigate('/super/clients')} style={{ border: '1px solid var(--border-dim)' }}>View all clients</button>
           <button className="btn btn-primary" onClick={() => navigate('/super/onboarding')}>◈ PROVISION NEW TENANT</button>
        </div>
      </div>

      {/* Intelligence Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
        {[
          { label: 'Total tenants', value: stats.total_tenants, sub: 'Active infrastructure', icon: '🏢' },
          { label: 'Global fleet', value: stats.total_devices, sub: 'Connected nodes', icon: '📡' },
          { label: 'Platform revenue', value: `$${stats.monthly_revenue?.toLocaleString()}`, sub: 'Projected MRR', icon: '💰', color: 'var(--ok)' },
          { label: 'Critical alerts', value: stats.alerts_today, sub: 'Last 24 hours', icon: '⚠️', color: stats.alerts_today > 0 ? 'var(--danger)' : 'var(--ok)' }
        ].map((s, i) => (
          <div key={i} className="panel" style={{ padding: '24px', border: '1px solid var(--border-mid)', background: 'linear-gradient(145deg, var(--bg-panel), rgba(255,255,255,0.01))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
               <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>{s.label}</div>
               <span style={{ fontSize: 16 }}>{s.icon}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color || 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{s.value || '0'}</div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 32 }}>
        {/* Active Registry */}
        <div className="panel" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-mid)' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255,255,255,0.01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, margin: 0, letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>Recent client activity</h3>
             <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Last 10 objects</span>
          </div>
          <table className="data-table" style={{ border: 'none' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                <th style={{ paddingLeft: 24 }}>Identity</th>
                <th>SLA</th>
                <th>Resource load</th>
                <th style={{ paddingRight: 24, textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {tenants.slice(0, 10).map((t) => {
                const usagePercent = Math.min(100, ((t.usage?.device_count || 0) / (t.plan_details?.max_devices || 100)) * 100);
                return (
                  <tr key={t._id || t.id} onClick={() => navigate(`/super/clients/${t._id || t.id}`)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--border-dim)' }} className="hover-row">
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                         <div style={{ width: 28, height: 28, background: 'var(--bg-surface)', borderRadius: 6, border: '1px solid var(--border-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {t.branding?.logo_url ? <img src={t.branding.logo_url} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} alt="" /> : <span style={{ fontSize: 14 }}>🏢</span>}
                         </div>
                         <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.company_name}</div>
                            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{t.subdomain}</div>
                         </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ 
                        fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 8px', 
                        background: 'var(--bg-surface)', border: `1px solid ${getPlanColor(t.plan)}44`, 
                        borderRadius: 4, color: getPlanColor(t.plan), letterSpacing: '0.05em', fontWeight: 600 
                      }}>
                        {sentence(t.plan) || 'N/A'}
                      </span>
                    </td>
                    <td>
                      <div style={{ width: 100 }}>
                        <div style={{ height: 4, background: 'var(--bg-surface)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${usagePercent}%`, background: usagePercent > 90 ? 'var(--danger)' : 'var(--accent)', borderRadius: 2 }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ paddingRight: 24, textAlign: 'right' }}>
                       <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t.status === 'active' ? 'var(--ok)' : 'var(--warn)' }} />
                          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{sentence(t.status)}</span>
                       </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Global Alerts Feed */}
        <div className="panel" style={{ padding: 0, border: '1px solid var(--border-mid)' }}>
           <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255, 77, 0, 0.03)' }}>
              <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, margin: 0, letterSpacing: '0.1em', color: 'var(--accent)' }}>Critical telemetry</h3>
           </div>
           <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {stats.top_tenants?.map((t, i) => (
                 <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border-dim)' }}>
                    <div>
                       <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{t.company_name}</div>
                       <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Abnormal event detected</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                       <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>{t.alert_count}</div>
                       <div style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Events</div>
                    </div>
                 </div>
              ))}
              {(!stats.top_tenants || stats.top_tenants.length === 0) && (
                 <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                    // ALL SYSTEMS NOMINAL
                 </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}
