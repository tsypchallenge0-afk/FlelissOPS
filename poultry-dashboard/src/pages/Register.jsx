import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/Api';
import './Auth.css';

export default function Register() {
    const [formData, setFormData] = useState({ name: '', email: '', password: '', farmId: '' });
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.register({
                username: formData.email,
                email: formData.email,
                password: formData.password,
                full_name: formData.name
            });
            navigate('/login');
        } catch (err) {
            console.error('Registration failed:', err);
            alert(err.response?.data?.detail || 'Registration failed');
        }
    };

    return (
        <div className="auth-page page-enter">
            <div className="auth-container panel">
                <div className="auth-header">
                    <h2 className="condensed">System registration</h2>
                    <div className="section-label">New operative enrollment</div>
                </div>

                <form onSubmit={handleSubmit} className="auth-form stagger">
                    <div className="form-group">
                        <label className="section-label">Full name</label>
                        <input
                            type="text"
                            className="auth-input mono"
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Jane doe"
                        />
                    </div>

                    <div className="form-group">
                        <label className="section-label">Contact email</label>
                        <input
                            type="email"
                            className="auth-input mono"
                            required
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                            placeholder="J.DOE@AIPOULTRY.COM"
                        />
                    </div>

                    <div className="form-group">
                        <label className="section-label">Farm identifier</label>
                        <input
                            type="text"
                            className="auth-input mono"
                            value={formData.farmId}
                            onChange={e => setFormData({ ...formData, farmId: e.target.value })}
                            placeholder="Optional: pf-xxxx-xx"
                        />
                    </div>

                    <div className="form-group">
                        <label className="section-label">Secure passcode</label>
                        <input
                            type="password"
                            className="auth-input mono"
                            required
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                            placeholder="••••••••"
                        />
                    </div>

                    <button type="submit" className="auth-submit condensed">
                        Initialize record
                    </button>
                </form>

                <div className="auth-footer">
                    <div className="section-label">ALREADY ENROLLED?</div>
                    <Link to="/login" className="auth-link mono">Return to authentication</Link>
                </div>
            </div>
        </div>
    );
}
