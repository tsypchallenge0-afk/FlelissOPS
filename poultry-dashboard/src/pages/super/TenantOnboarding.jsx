import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/Api';
import { toast } from 'sonner';

export default function TenantOnboarding() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_name: '',
    subdomain: '',
    contact_name: '',
    contact_email: '',
    plan: 'trial',
    plan_details: {
      max_farms: 1,
      max_houses: 2,
      max_devices: 10,
      max_users: 2,
    },
    billing: {
      monthly_value: 0,
      contract_end: '',
    },
    branding: {
      primary_color: '#ff4d00',
      logo_url: '',
    }
  });

  // Live CSS variable injection for branding preview
  useEffect(() => {
    if (form.branding?.primary_color) {
      document.documentElement.style.setProperty('--accent', form.branding.primary_color);
      document.documentElement.style.setProperty('--accent-glow', `${form.branding.primary_color}44`);
    }
    return () => {
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--accent-glow');
    };
  }, [form.branding?.primary_color]);

  const handlePlanChange = (tier) => {
    const defaults = {
      trial:        { max_farms: 1,  max_houses: 2,   max_devices: 10,   max_users: 2,   mrr: 0 },
      standard:     { max_farms: 5,  max_houses: 20,  max_devices: 100,  max_users: 10,  mrr: 499 },
      professional: { max_farms: 20, max_houses: 100, max_devices: 500,  max_users: 50,  mrr: 1499 },
      enterprise:   { max_farms: -1, max_houses: -1,  max_devices: -1,   max_users: -1,  mrr: 5000 },
      custom:       { max_farms: 0,  max_houses: 0,   max_devices: 0,    max_users: 0,   mrr: 0 }
    };
    
    const d = defaults[tier];
    setForm(prev => ({
      ...prev,
      plan: tier,
      plan_details: {
        max_farms: d.max_farms,
        max_houses: d.max_houses,
        max_devices: d.max_devices,
        max_users: d.max_users
      },
      billing: {
        ...prev.billing,
        monthly_value: d.mrr
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createTenant(form);
      toast.success('Tenant provisioning sequence complete');
      navigate('/super/clients');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Provisioning failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border-dim)', paddingBottom: 24 }}>
        <div>
          <button onClick={() => navigate('/super/clients')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, padding: 0, marginBottom: 12 }}>← BACK TO REGISTRY</button>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, margin: 0, color: 'var(--text-primary)' }}>Onboard new tenant</h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>Initializing new infrastructure object</div>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 32 }}>
        {/* Core Identity */}
        <div className="panel" style={{ padding: 32 }}>
           <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.1em' }}>◈ IDENTITY & ACCESS</h3>
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div className="field-group">
                 <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 8, display: 'block' }}>Company name</label>
                 <input required value={form.company_name} onChange={e => setForm({...form, company_name: e.target.value})} placeholder="e.g. Global Agri Corp" />
              </div>
              <div className="field-group">
                 <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 8, display: 'block' }}>Subdomain URL</label>
                 <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input required value={form.subdomain} onChange={e => setForm({...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})} placeholder="company-slug" style={{ flex: 1 }} />
                    <span style={{ padding: '0 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>.fleliss-ops.com</span>
                 </div>
              </div>
           </div>
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
              <div className="field-group">
                 <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 8, display: 'block' }}>Primary admin name</label>
                 <input required value={form.contact_name} onChange={e => setForm({...form, contact_name: e.target.value})} placeholder="Full Name" />
              </div>
              <div className="field-group">
                 <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 8, display: 'block' }}>Primary admin email</label>
                 <input type="email" required value={form.contact_email} onChange={e => setForm({...form, contact_email: e.target.value})} placeholder="admin@company.com" />
              </div>
           </div>
        </div>

        {/* Subscription & Quotas */}
        <div className="panel" style={{ padding: 32 }}>
           <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.1em' }}>◈ SUBSCRIPTION & QUOTAS</h3>
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div className="field-group">
                 <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 8, display: 'block' }}>Plan tier</label>
                 <select value={form.plan} onChange={e => handlePlanChange(e.target.value)}>
                    <option value="trial">Trial</option>
                    <option value="standard">Standard</option>
                    <option value="professional">Professional</option>
                    <option value="enterprise">Enterprise</option>
                    <option value="custom">Custom</option>
                 </select>
              </div>
              <div className="field-group">
                 <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 8, display: 'block' }}>MONTHLY REVENUE ($)</label>
                 <input type="number" required value={form.billing.monthly_value} onChange={e => setForm({...form, billing: {...form.billing, monthly_value: parseInt(e.target.value)}})} />
              </div>
           </div>
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginTop: 24 }}>
              <div className="field-group">
                 <label style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)', marginBottom: 6 }}>Max farms</label>
                 <input type="number" required value={form.plan_details.max_farms} onChange={e => setForm({...form, plan_details: {...form.plan_details, max_farms: parseInt(e.target.value)}})} />
              </div>
              <div className="field-group">
                 <label style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)', marginBottom: 6 }}>Max houses</label>
                 <input type="number" required value={form.plan_details.max_houses} onChange={e => setForm({...form, plan_details: {...form.plan_details, max_houses: parseInt(e.target.value)}})} />
              </div>
              <div className="field-group">
                 <label style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)', marginBottom: 6 }}>Max nodes</label>
                 <input type="number" required value={form.plan_details.max_devices} onChange={e => setForm({...form, plan_details: {...form.plan_details, max_devices: parseInt(e.target.value)}})} />
              </div>
              <div className="field-group">
                 <label style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)', marginBottom: 6 }}>Max operators</label>
                 <input type="number" required value={form.plan_details.max_users} onChange={e => setForm({...form, plan_details: {...form.plan_details, max_users: parseInt(e.target.value)}})} />
              </div>
           </div>
        </div>

        {/* Branding Identity */}
        <div className="panel" style={{ padding: 32 }}>
           <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.1em' }}>◈ BRANDING IDENTITY</h3>
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div className="field-group">
                 <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 8, display: 'block' }}>Corporate logo asset (local upload)</label>
                 <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <input 
                       type="file" 
                       accept="image/*" 
                       onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onloadend = () => {
                             setForm({...form, branding: {...form.branding, logo_url: reader.result}});
                          };
                          reader.readAsDataURL(file);
                       }} 
                       style={{ display: 'none' }} 
                       id="logo-upload-onboarding"
                    />
                    <label htmlFor="logo-upload-onboarding" className="btn btn-ghost" style={{ flex: 1, textAlign: 'center', borderStyle: 'dashed', padding: '10px' }}>
                       {form.branding?.logo_url ? 'Asset attached' : 'Select image file'}
                    </label>
                 </div>
              </div>
              <div className="field-group">
                 <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 8, display: 'block' }}>Primary accent color</label>
                 <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <input type="color" value={form.branding.primary_color} onChange={e => setForm({...form, branding: {...form.branding, primary_color: e.target.value}})} style={{ width: 48, height: 40, border: 'none', background: 'transparent' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{form.branding.primary_color}</span>
                 </div>
              </div>
           </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
           <button type="button" onClick={() => navigate('/super/clients')} className="btn btn-ghost" style={{ padding: '12px 32px' }}>Cancel</button>
           <button type="submit" disabled={saving} className="btn btn-primary" style={{ padding: '12px 48px' }}>
              {saving ? 'Provisioning infrastructure…' : 'Complete onboarding'}
           </button>
        </div>
      </form>
    </div>
  );
}
