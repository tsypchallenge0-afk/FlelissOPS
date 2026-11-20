import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/Api';
import { toast } from 'sonner';
import { sentence } from '../../lib/format';

export default function TenantList() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.getTenants()
      .then(setTenants)
      .finally(() => setLoading(false));
  }, []);

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.status === 'active').length,
    mrr: tenants.reduce((acc, t) => acc + (t.billing?.monthly_value || 0), 0),
    avg_load: tenants.length ? Math.round(tenants.reduce((acc, t) => acc + (((t.usage?.device_count || 0) / (t.plan_details?.max_devices || 100)) * 100), 0) / tenants.length) : 0
  };

  const filteredTenants = tenants.filter(t => 
    t.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.subdomain?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  const handleDelete = async (id) => {
    const targetId = id || '';
    if (!targetId) { toast.error('Object ID invalid'); return; }
    if (!confirm('DECOMMISSION TENANT? This action is irreversible.')) return;
    
    try {
      await api.deleteTenant(targetId);
      setTenants(prev => prev.filter(t => (t._id || t.id) !== targetId));
      toast.success('Tenant decommissioned successfully');
    } catch (err) {
      toast.error('Decommissioning failed: ' + (err.response?.data?.detail || 'Endpoint Unreachable'));
    }
  };

  if (loading) return <div style={{ padding: 40, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>Retrieving registry...</div>;

  return (
    <div className="page" style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 40, maxWidth: 1600, margin: '0 auto' }}>
      
      {/* Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.2em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 40, height: 1, background: 'var(--accent)' }} /> 
            Infrastructure registry
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 42, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Client directory</h1>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/super/onboarding')} style={{ padding: '12px 32px', fontSize: 12, fontWeight: 600 }}>
          ◈ PROVISION NEW TENANT
        </button>
      </div>

      {/* Intelligence Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
        {[
          { label: 'Total assets', value: stats.total, sub: 'Registered objects', icon: '🏢' },
          { label: 'Active fleet', value: stats.active, sub: 'Online instances', icon: '📡' },
          { label: 'Projected MRR', value: `$${stats.mrr.toLocaleString()}`, sub: 'Recurring revenue', icon: '💰', color: 'var(--ok)' },
          { label: 'System load', value: `${stats.avg_load}%`, sub: 'Avg resource util', icon: '⚡', color: stats.avg_load > 80 ? 'var(--danger)' : 'var(--accent)' }
        ].map((s, i) => (
          <div key={i} className="panel" style={{ padding: '24px', border: '1px solid var(--border-mid)', background: 'linear-gradient(145deg, var(--bg-panel), rgba(255,255,255,0.01))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
               <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>{s.label}</div>
               <span style={{ fontSize: 16 }}>{s.icon}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color || 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{s.value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Registry Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-panel)', padding: '12px 24px', borderRadius: 8, border: '1px solid var(--border-dim)' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 14 }}>🔍</span>
            <input 
              type="text" 
              placeholder="Search by company or subdomain..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'white', fontFamily: 'var(--font-mono)', fontSize: 12, width: '100%', outline: 'none' }}
            />
         </div>
         <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            MATCHES: {filteredTenants.length} / {tenants.length}
         </div>
      </div>

      {/* Registry Table */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-mid)' }}>
        <table className="data-table" style={{ border: 'none' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
              <th style={{ paddingLeft: 32, width: 300 }}>Client identity</th>
              <th>Status</th>
              <th>SLA protocol</th>
              <th>Financials</th>
              <th>Resource load</th>
              <th style={{ paddingRight: 32, textAlign: 'right' }}>Command interface</th>
            </tr>
          </thead>
          <tbody>
            {filteredTenants.map((t) => {
              const usagePercent = Math.min(100, ((t.usage?.device_count || 0) / (t.plan_details?.max_devices || 100)) * 100);
              return (
                <tr key={t._id || t.id} style={{ borderBottom: '1px solid var(--border-dim)', transition: 'background 0.2s' }} className="hover-row">
                  <td style={{ padding: '24px 32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                       <div style={{ width: 36, height: 36, background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {t.branding?.logo_url ? <img src={t.branding.logo_url} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} alt="" /> : <span style={{ fontSize: 18 }}>🏢</span>}
                       </div>
                       <div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{t.company_name}</div>
                          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', marginTop: 2 }}>{t.subdomain}.lvh.me</div>
                       </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                       <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: t.status === 'active' ? 'var(--ok)' : 'var(--warn)', boxShadow: `0 0 8px ${t.status === 'active' ? 'var(--ok)' : 'var(--warn)'}66` }} />
                       <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontWeight: 600 }}>{sentence(t.status)}</span>
                    </div>
                  </td>
                  <td>
                    <span style={{ 
                      fontFamily: 'var(--font-mono)', fontSize: 10, padding: '4px 10px', 
                      background: 'var(--bg-surface)', border: `1px solid ${getPlanColor(t.plan)}66`, 
                      borderRadius: 4, color: getPlanColor(t.plan), letterSpacing: '0.05em', fontWeight: 600 
                    }}>
                       {sentence(t.plan) || 'N/A'}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>${(t.billing?.monthly_value || 0).toLocaleString()}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Recurring / mo</div>
                  </td>
                  <td>
                    <div style={{ width: 140 }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'var(--font-mono)', marginBottom: 6, color: 'var(--text-dim)' }}>
                          <span>Load</span>
                          <span>{usagePercent.toFixed(0)}%</span>
                       </div>
                       <div style={{ height: 4, background: 'var(--bg-surface)', borderRadius: 2, position: 'relative' }}>
                          <div style={{ height: '100%', width: `${usagePercent}%`, background: usagePercent > 90 ? 'var(--danger)' : 'var(--accent)', borderRadius: 2, boxShadow: usagePercent > 90 ? '0 0 8px var(--danger)' : '0 0 8px var(--accent-glow)' }} />
                       </div>
                    </div>
                  </td>
                  <td style={{ paddingRight: 32, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                       <button onClick={() => navigate(`/super/clients/${t._id || t.id}`)} className="btn btn-ghost" style={{ fontSize: 10, padding: '8px 16px', border: '1px solid var(--border-dim)' }}>Manage</button>
                       <button onClick={() => handleDelete(t._id || t.id)} className="btn btn-ghost" style={{ fontSize: 10, padding: '8px 16px', color: 'var(--danger)', border: '1px solid transparent' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredTenants.length === 0 && (
          <div style={{ padding: 80, textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
             // NO OBJECTS MATCHING THE SEARCH PARAMETERS FOUND IN REGISTRY
          </div>
        )}
      </div>
    </div>
  );
}
