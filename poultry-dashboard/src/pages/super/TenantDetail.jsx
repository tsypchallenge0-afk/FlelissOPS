import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/Api';
import { toast } from 'sonner';
import { getTenantSubdomain } from '../../lib/tenant';
import { sentence } from '../../lib/format';

export default function TenantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('infrastructure');
  const [tenant, setTenant] = useState(null);
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getTenant(id), 
      api.getTenantUsers(id),
      api.getTenantInvitations(id)
    ])
      .then(([t, u, i]) => { setTenant(t); setUsers(u); setInvites(i); })
      .catch(() => { toast.error('Access Denied'); navigate('/super/clients'); })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const copyInviteLink = (token) => {
    const baseUrl = getTenantSubdomain(tenant.subdomain);
    const url = `${baseUrl}/accept-invite?token=${token}`;
    
    // Fallback for insecure contexts where navigator.clipboard is unavailable
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Manual copy failed', err);
      }
      document.body.removeChild(textArea);
    }
    toast.success('Invitation link copied to clipboard');
  };

  // Live CSS variable injection for branding preview
  useEffect(() => {
    if (tenant?.branding?.primary_color) {
      document.documentElement.style.setProperty('--accent', tenant.branding.primary_color);
      document.documentElement.style.setProperty('--accent-glow', `${tenant.branding.primary_color}44`);
    }
    return () => {
      // Restore default super admin accent on unmount
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--accent-glow');
    };
  }, [tenant?.branding?.primary_color]);

  const handlePlanChange = (tier) => {
    const defaults = {
      trial:        { max_farms: 1,  max_houses: 2,   max_devices: 10,   max_users: 2 },
      standard:     { max_farms: 5,  max_houses: 20,  max_devices: 100,  max_users: 10 },
      professional: { max_farms: 20, max_houses: 100, max_devices: 500,  max_users: 50 },
      enterprise:   { max_farms: -1, max_houses: -1,  max_devices: -1,   max_users: -1 },
      custom:       { max_farms: tenant.plan_details?.max_farms, max_houses: tenant.plan_details?.max_houses, max_devices: tenant.plan_details?.max_devices, max_users: tenant.plan_details?.max_users }
    };
    
    const d = defaults[tier];
    setTenant(prev => ({
      ...prev,
      plan: tier,
      plan_details: {
        ...prev.plan_details,
        ...d
      }
    }));
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    
    // Construct updates based on what's in the current form tab
    const updates = {
      plan: fd.get('plan') || tenant.plan,
      plan_details: {
        max_farms: fd.has('max_farms') ? parseInt(fd.get('max_farms')) : tenant.plan_details?.max_farms,
        max_houses: fd.has('max_houses') ? parseInt(fd.get('max_houses')) : tenant.plan_details?.max_houses,
        max_devices: fd.has('max_devices') ? parseInt(fd.get('max_devices')) : tenant.plan_details?.max_devices,
        max_users: fd.has('max_users') ? parseInt(fd.get('max_users')) : tenant.plan_details?.max_users,
      },
      branding: {
        logo_url: tenant.branding?.logo_url,
        primary_color: tenant.branding?.primary_color,
      }
    };

    try {
      await api.updateTenant(id, updates);
      toast.success('System configuration committed');
      setTenant(prev => ({ ...prev, ...updates }));
    } catch (err) { 
      console.error(err);
      toast.error('Commit failed: ' + (err.response?.data?.detail || 'Unknown error')); 
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      if (newStatus === 'suspended') {
        const reason = prompt('Reason for suspension:');
        if (!reason) return;
        await api.suspendTenant(id, { reason });
      } else if (newStatus === 'active') {
        await api.activateTenant(id);
      } else if (newStatus === 'deleted') {
        if (!confirm('CRITICAL: PERMANENTLY DELETE TENANT AND ALL ASSOCIATED DATA?')) return;
        await api.deleteTenant(id);
        toast.success('Tenant infrastructure decommissioned');
        navigate('/super/clients');
        return;
      }
      setTenant(prev => ({ ...prev, status: newStatus }));
      toast.success(`OBJECT STATUS UPDATED TO: ${sentence(newStatus)}`);
    } catch (_err) {
      toast.error('State transition failed');
    }
  };

  const getPlanColor = (plan) => {
    const colors = {
      trial: 'var(--text-dim)',
      standard: 'var(--ok)',
      professional: 'var(--accent)',
      enterprise: '#a855f7', // Purple for Enterprise
      custom: '#0ea5e9'      // Blue for Custom
    };
    return colors[plan] || 'var(--text-secondary)';
  };

  if (loading) return <div style={{ padding: 40, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>// ACCESSING ENCRYPTED OBJECT DATA...</div>;

  return (
    <div className="page" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* Premium Header Card */}
      <div className="panel corner-decor fade-in" style={{ 
        background: 'linear-gradient(to right, var(--bg-panel), rgba(255, 77, 0, 0.03))',
        padding: '32px',
        border: '1px solid var(--border-mid)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ 
            width: 80, height: 80, borderRadius: '16px', background: 'var(--bg-surface)', 
            border: '1px solid var(--border-mid)', display: 'flex', alignItems: 'center', 
            justifyContent: 'center', position: 'relative', overflow: 'hidden'
          }}>
            {tenant?.branding?.logo_url ? (
              <img 
                src={tenant?.branding?.logo_url} 
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 12 }} 
                alt="" 
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
              />
            ) : null}
            <span style={{ fontSize: 32, display: tenant?.branding?.logo_url ? 'none' : 'block' }}>🏢</span>
            <div style={{ 
              position: 'absolute', bottom: -4, right: -4, width: 16, height: 16, 
              borderRadius: '50%', background: tenant.status === 'active' ? 'var(--ok)' : 'var(--warn)',
              border: '3px solid var(--bg-panel)', boxShadow: `0 0 10px ${tenant.status === 'active' ? 'var(--ok)' : 'var(--warn)'}`
            }} />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.2em', marginBottom: 4 }}>TENANT ID: {sentence(id)}</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{tenant?.company_name}</h1>
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
               <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>◈ {tenant?.subdomain}.lvh.me</span>
               <span style={{ fontSize: 11, color: getPlanColor(tenant.plan), fontFamily: 'var(--font-mono)', fontWeight: 600 }}>◈ {sentence(tenant.plan)} ACCESS</span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 12 }}>
           <div className="panel" style={{ padding: '8px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border-dim)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>Tenant console endpoint</div>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{getTenantSubdomain(tenant?.subdomain)}</div>
              <button 
                 onClick={() => window.open(getTenantSubdomain(tenant?.subdomain), '_blank')}
                 style={{ marginTop: 4, padding: '4px 12px', fontSize: 9, fontFamily: 'var(--font-mono)', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 2, cursor: 'pointer', fontWeight: 600 }}
              >
                 ◈ TELEPORT TO CONSOLE
              </button>
           </div>
           <button onClick={() => navigate('/super/clients')} style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, padding: '8px 16px', borderRadius: 4, letterSpacing: '0.05em' }}>Return to directory</button>
        </div>
      </div>

      {/* Segmented Control (Tabs) */}
      <div style={{ display: 'flex', gap: 8, background: 'rgba(255,255,255,0.02)', padding: 4, borderRadius: 8, border: '1px solid var(--border-dim)', alignSelf: 'flex-start' }}>
        {[
          { id: 'infrastructure', label: 'Infrastructure', icon: '⚙️' },
          { id: 'operators', label: 'Operators', icon: '👥' },
          { id: 'branding', label: 'Identity', icon: '🎨' },
          { id: 'telemetry', label: 'Telemetry', icon: '📡' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 24px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.05em',
              background: activeTab === tab.id ? 'var(--bg-surface)' : 'transparent',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-dim)',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 8
            }}
          >
            <span style={{ fontSize: 12 }}>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '32px' }}>
        {/* Main Content Area */}
        <div>
           {activeTab === 'infrastructure' && (
             <form onSubmit={handleUpdate} className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                <div className="panel" style={{ padding: 32 }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, margin: 0 }}>System provisioning</h3>
                      <button type="submit" className="btn btn-primary" style={{ padding: '8px 24px' }}>Commit config</button>
                   </div>
                   
                   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                      <div className="field-group">
                         <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 12, display: 'block' }}>SLA protocol</label>
                         <select name="plan" value={tenant.plan} onChange={e => handlePlanChange(e.target.value)} style={{ width: '100%', padding: '14px', background: 'var(--bg-surface)', border: '1px solid var(--border-mid)', borderRadius: 8, color: 'var(--text-primary)' }}>
                            <option value="trial">Standard Trial</option>
                            <option value="standard">Business Standard</option>
                            <option value="professional">Enterprise Professional</option>
                            <option value="enterprise">Global Enterprise</option>
                            <option value="custom">Custom Configuration</option>
                         </select>
                      </div>
                      <div className="field-group">
                         <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 12, display: 'block' }}>Resource hard-limits</label>
                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div style={{ position: 'relative' }}>
                               <input type="number" name="max_farms" value={tenant.plan_details?.max_farms ?? 0} onChange={e => setTenant({...tenant, plan_details: {...tenant.plan_details, max_farms: parseInt(e.target.value)}})} style={{ paddingLeft: 40 }} />
                               <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Frm:</span>
                            </div>
                            <div style={{ position: 'relative' }}>
                               <input type="number" name="max_houses" value={tenant.plan_details?.max_houses ?? 0} onChange={e => setTenant({...tenant, plan_details: {...tenant.plan_details, max_houses: parseInt(e.target.value)}})} style={{ paddingLeft: 40 }} />
                               <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Hse:</span>
                            </div>
                         </div>
                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
                            <div style={{ position: 'relative' }}>
                               <input type="number" name="max_devices" value={tenant.plan_details?.max_devices ?? 0} onChange={e => setTenant({...tenant, plan_details: {...tenant.plan_details, max_devices: parseInt(e.target.value)}})} style={{ paddingLeft: 40 }} />
                               <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Nod:</span>
                            </div>
                            <div style={{ position: 'relative' }}>
                               <input type="number" name="max_users" value={tenant.plan_details?.max_users ?? 0} onChange={e => setTenant({...tenant, plan_details: {...tenant.plan_details, max_users: parseInt(e.target.value)}})} style={{ paddingLeft: 40 }} />
                               <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Usr:</span>
                            </div>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="panel" style={{ padding: 32 }}>
                   <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, margin: 0, marginBottom: 24 }}>Network nodes</h3>
                   <div style={{ height: 120, background: 'var(--bg-surface)', border: '1px dashed var(--border-dim)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                      // NODE VISUALIZATION MAP OFFLINE
                   </div>
                </div>
             </form>
           )}

            {activeTab === 'operators' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                <div className="panel fade-in" style={{ padding: 0, overflow: 'hidden' }}>
                   <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255,255,255,0.01)' }}>
                      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, margin: 0 }}>Active operators</h3>
                   </div>
                   <table className="data-table" style={{ border: 'none' }}>
                      <thead>
                         <tr>
                            <th style={{ paddingLeft: 24 }}>Operator</th>
                            <th>Role</th>
                            <th>Connectivity</th>
                            <th style={{ paddingRight: 24, textAlign: 'right' }}>Last access</th>
                         </tr>
                      </thead>
                      <tbody>
                         {users.map((u, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                               <td style={{ padding: '20px 24px' }}>
                                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{u.full_name || u.username}</div>
                                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{u.email}</div>
                               </td>
                               <td><span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', padding: '2px 8px', background: 'var(--bg-surface)', border: '1px solid var(--border-dim)', borderRadius: 4 }}>{sentence(u.role)}</span></td>
                               <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                     <div style={{ width: 6, height: 6, borderRadius: '50%', background: u.last_login ? 'var(--ok)' : 'var(--text-dim)' }} />
                                     <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{u.last_login ? 'Active' : 'Inactive'}</span>
                                  </div>
                               </td>
                               <td style={{ paddingRight: 24, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                                  {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                               </td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>

                <div className="panel fade-in" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-dim)' }}>
                   <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255, 77, 0, 0.05)' }}>
                      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, margin: 0, color: 'var(--accent)' }}>Pending invitations (manual bypass)</h3>
                   </div>
                   <table className="data-table" style={{ border: 'none' }}>
                      <thead>
                         <tr>
                            <th style={{ paddingLeft: 24 }}>Recipient</th>
                            <th>Role</th>
                            <th>Expires</th>
                            <th style={{ paddingRight: 24, textAlign: 'right' }}>Command</th>
                         </tr>
                      </thead>
                      <tbody>
                         {invites.filter(inv => inv.status === 'pending').map((inv, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                               <td style={{ padding: '20px 24px' }}>
                                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{inv.email}</div>
                                  <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>STATUS: {sentence(inv.status)}</div>
                               </td>
                               <td><span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', padding: '2px 8px', background: 'var(--bg-surface)', border: '1px solid var(--border-dim)', borderRadius: 4 }}>{sentence(inv.role)}</span></td>
                               <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                                  {new Date(inv.expires_at).toLocaleDateString()}
                               </td>
                               <td style={{ paddingRight: 24, textAlign: 'right' }}>
                                  <button onClick={() => copyInviteLink(inv.token)} className="btn btn-ghost" style={{ fontSize: 9, color: 'var(--accent)', border: '1px solid var(--border-dim)' }}>
                                     ◈ COPY INVITE URL
                                  </button>
                               </td>
                            </tr>
                         ))}
                         {invites.filter(inv => inv.status === 'pending').length === 0 && (
                            <tr>
                               <td colSpan="4" style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                                  // NO PENDING INVITATIONS IN REGISTRY
                               </td>
                            </tr>
                         )}
                      </tbody>
                   </table>
                </div>
              </div>
            )}

           {activeTab === 'branding' && (
             <form onSubmit={handleUpdate} className="fade-in panel" style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 32 }}>
                <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, margin: 0 }}>White-label configuration</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                   <div className="field-group">
                      <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 12, display: 'block' }}>Corporate logo asset (local upload)</label>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                         <input 
                            type="file" 
                            accept="image/*" 
                            onChange={async (e) => {
                               const file = e.target.files[0];
                               if (!file) return;
                               const reader = new FileReader();
                               reader.onloadend = () => {
                                  setTenant({...tenant, branding: {...tenant.branding, logo_url: reader.result}});
                               };
                               reader.readAsDataURL(file);
                            }} 
                            style={{ display: 'none' }} 
                            id="logo-upload"
                         />
                         <label htmlFor="logo-upload" className="btn btn-ghost" style={{ flex: 1, textAlign: 'center', borderStyle: 'dashed', padding: '12px' }}>
                            {tenant.branding?.logo_url ? 'Change asset' : 'Select image file'}
                         </label>
                         {tenant.branding?.logo_url && (
                            <button type="button" onClick={() => setTenant({...tenant, branding: {...tenant.branding, logo_url: ''}})} className="btn btn-ghost" style={{ color: 'var(--danger)', padding: '12px' }}>✕</button>
                         )}
                      </div>
                   </div>
                   <div className="field-group">
                      <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 12, display: 'block' }}>Primary system accent</label>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                         <input type="color" name="primary_color" value={tenant.branding?.primary_color || '#ff4d00'} onChange={e => setTenant({...tenant, branding: {...tenant.branding, primary_color: e.target.value}})} style={{ width: 60, height: 44, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                         <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>{tenant.branding?.primary_color || '#FF4D00'}</span>
                      </div>
                   </div>
                </div>
                <div style={{ marginTop: 12, padding: 24, background: 'var(--bg-surface)', border: '1px dashed var(--border-dim)', borderRadius: 12, textAlign: 'center' }}>
                   <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Preview: Console Integration</div>
                   <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 24px', background: 'var(--bg-panel)', borderRadius: 8, border: '1px solid var(--border-mid)' }}>
                      <div style={{ width: 24, height: 24, background: 'var(--bg-surface)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         {tenant.branding?.logo_url ? <img src={tenant.branding.logo_url} style={{ height: 14 }} alt="" /> : <span style={{ color: tenant.branding?.primary_color || 'var(--accent)', fontSize: 12 }}>◈</span>}
                      </div>
                      <div style={{ height: 8, width: 80, background: 'var(--bg-surface)', borderRadius: 4 }} />
                   </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                   <button type="submit" className="btn btn-primary" style={{ padding: '8px 32px' }}>Save identity</button>
                </div>
             </form>
           )}
        </div>

        {/* Sidebar Intelligence */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
           <div className="panel" style={{ padding: 24 }}>
              <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', margin: 0, marginBottom: 16, textTransform: 'uppercase' }}>Financial Health</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                 <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--ok)', fontWeight: 600 }}>${tenant.billing?.monthly_value || '0.00'}<span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 400 }}>/MO</span></div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>Contracted revenue</div>
                 </div>
                 <div style={{ height: 1, background: 'var(--border-dim)' }} />
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                       <span style={{ color: 'var(--text-dim)' }}>Membership</span>
                       <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{new Date(tenant.created_at).toLocaleDateString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                       <span style={{ color: 'var(--text-dim)' }}>Lifetime value</span>
                       <span style={{ color: 'var(--ok)', fontFamily: 'var(--font-mono)' }}>$12.4K</span>
                    </div>
                 </div>
              </div>
           </div>

           <div className="panel" style={{ padding: 24 }}>
              <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', margin: 0, marginBottom: 16, textTransform: 'uppercase' }}>Quota Utilization</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                 {[
                   { label: 'Farms', current: tenant.usage?.farm_count, max: tenant.plan_details?.max_farms },
                   { label: 'Nodes', current: tenant.usage?.device_count, max: tenant.plan_details?.max_devices }
                 ].map((q, i) => (
                   <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 8 }}>
                         <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{q.label}</span>
                         <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{q.current} / {q.max === -1 ? '∞' : q.max}</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--bg-surface)', borderRadius: 2 }}>
                         <div style={{ height: '100%', width: q.max === -1 ? '10%' : `${(q.current / q.max) * 100}%`, background: 'var(--accent)', borderRadius: 2, boxShadow: '0 0 8px var(--accent-glow)' }} />
                      </div>
                   </div>
                 ))}
              </div>
           </div>

           <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tenant.status === 'active' ? (
                <button onClick={() => handleStatusChange('suspended')} className="btn btn-danger" style={{ width: '100%', padding: '12px', fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>Suspend tenant access</button>
              ) : (
                <button onClick={() => handleStatusChange('active')} className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>Re-activate tenant access</button>
              )}
              <button onClick={() => handleStatusChange('deleted')} style={{ width: '100%', padding: '8px', fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', background: 'transparent', border: '1px solid var(--border-dim)', color: 'var(--text-dim)', cursor: 'pointer', borderRadius: 4 }}>Terminate infrastructure object</button>
           </div>
        </div>
      </div>
    </div>
  );
}
