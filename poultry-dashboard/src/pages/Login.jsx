import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

export default function Login({ superAdmin = false }) {
    const [formData, setFormData] = useState({ identifier: '', password: '' });
    const [error, setError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from ?? (superAdmin ? '/super' : '/app');
    const { login } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);
        try {
            await login(formData.identifier, formData.password);
            navigate(from, { replace: true });
        } catch (err) {
            console.error("Login failed:", err);
            setError(err.response?.data?.detail || 'Invalid credentials. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="auth-page page-enter">
            <div className="auth-container panel">
                <div className="auth-header">
                    <h2 className="condensed">System login</h2>
                    <div className="section-label">Authentication protocol</div>
                </div>

                <form onSubmit={handleSubmit} className="auth-form stagger">
                    {error && (
                        <div style={{ backgroundColor: 'var(--danger-glow)', border: '1px solid var(--danger)', padding: '10px', color: 'var(--danger)', borderRadius: 'var(--radius)', fontSize: '13px', textAlign: 'center', marginBottom: '10px' }}>
                            {error}
                        </div>
                    )}
                    <div className="form-group">
                        <label className="section-label">Operative ID or email</label>
                        <input
                            type="text"
                            className="auth-input mono"
                            required
                            value={formData.identifier}
                            onChange={e => setFormData({ ...formData, identifier: e.target.value })}
                            placeholder="username or email"
                            disabled={isSubmitting}
                        />
                    </div>

                    <div className="form-group">
                        <label className="section-label">Passcode</label>
                        <input
                            type="password"
                            className="auth-input mono"
                            required
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                            placeholder="••••••••"
                            disabled={isSubmitting}
                        />
                    </div>

                    <button type="submit" className="auth-submit condensed" disabled={isSubmitting}>
                        {isSubmitting ? 'Authorizing…' : 'Authorize protocol'}
                    </button>
                </form>

                <div className="auth-footer">
                    <div className="section-label">NO CREDENTIALS?</div>
                    <Link to="/register" className="auth-link mono">Initiate registration override</Link>
                </div>
            </div>
        </div>
    );
}
