import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useWSStatus } from '../context/WSContext';
import { useAuth } from '../context/AuthContext';

export default function Topbar() {
    const { theme, toggle } = useTheme();
    const wsStatus = useWSStatus();
    const { user } = useAuth();
    const [time, setTime] = useState(new Date());
    const location = useLocation();

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const getPageTitle = () => {
        const path = location.pathname;
        if (path === '/') return 'Command Center';
        if (path.includes('/houses/')) return 'House Control';
        if (path.includes('/farms/')) return 'Farm Operations';
        if (path === '/control') return 'Global Control';
        if (path === '/maintenance') return 'Maintenance';
        if (path === '/alerts') return 'Alert Management';
        if (path === '/analytics') return 'Business Intelligence';
        return 'FlelissOPS';
    };

    return (
        <header style={{
            height: 'var(--header-height)',
            backgroundColor: 'var(--bg-void)',
            borderBottom: '1px solid var(--border-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            flexShrink: 0
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span className="mono-text" style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                    Sys://FlelissOPS-core
                </span>
                <span className="mono-text" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                    {time.toISOString().replace('T', ' ').substring(0, 19)} UTC
                </span>
            </div>

            <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '17px',
                fontWeight: 600,
                color: 'var(--text-primary)'
            }}>
                {getPageTitle()}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        backgroundColor: wsStatus === 'connected' ? 'var(--ok)' : wsStatus === 'connecting' || wsStatus === 'reconnecting' ? 'var(--warn)' : 'var(--danger)',
                        boxShadow: 'none'
                    }} />
                    <span className="mono-text" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {wsStatus.charAt(0).toUpperCase() + wsStatus.slice(1)}
                    </span>
                </div>

                {user && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                        {user.username} · {user.role}
                    </span>
                )}

                <button onClick={toggle} className="btn btn-ghost" style={{ padding: '6px 14px', minWidth: 'auto', minHeight: 36 }}>
                    {theme === 'light' ? 'Dark' : 'Light'}
                </button>
            </div>
        </header>
    );
}
