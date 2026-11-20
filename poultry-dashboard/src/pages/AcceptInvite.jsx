import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: '',
    full_name: '',
    password: '',
    confirm_password: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      toast.error('Invalid or missing invitation token');
      navigate('/login');
    }
  }, [token, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm_password) {
      toast.error('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const base = import.meta.env.VITE_API_BASE_URL || '/api';
      await axios.post(`${base}/users/invitations/accept`, {
        token,
        username: form.username,
        full_name: form.full_name,
        password: form.password,
      });
      toast.success('Account created successfully! You can now log in.');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to accept invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div className="panel" style={{ width: 400 }}>
        <div className="panel-header" style={{ marginBottom: 20 }}>
          <span className="panel-title">Accept invitation</span>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Username</label>
            <input required value={form.username} onChange={e => setForm({...form, username: e.target.value})} style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-mid)', color: 'white', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 13 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Full name</label>
            <input required value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-mid)', color: 'white', padding: '10px 12px', fontFamily: 'var(--font-display)', fontSize: 14 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Password</label>
            <input type="password" required value={form.password} onChange={e => setForm({...form, password: e.target.value})} style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-mid)', color: 'white', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 13 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Confirm password</label>
            <input type="password" required value={form.confirm_password} onChange={e => setForm({...form, confirm_password: e.target.value})} style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-mid)', color: 'white', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 13 }} />
          </div>
          
          <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: 8 }}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
