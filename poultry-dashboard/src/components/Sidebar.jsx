import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Factory, Sliders, Wrench, Bell, BarChart3, LogOut, Bird } from 'lucide-react';
import { useAuth, useRole, useBranding } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../lib/Api';
import logoLight from '../assets/logo_light.png';
import logoDark from '../assets/logo_dark.png';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const branding = useBranding();
  const { theme } = useTheme();
  const role = useRole();
  const [firstFarm, setFirstFarm] = useState(null);

  useEffect(() => {
    api.getFarms()
      .then((farms) => {
        if (farms && farms.length > 0) setFirstFarm(farms[0].id);
      })
      .catch(err => console.error("Sidebar failed to load farm navigation", err));
  }, []);

  const links = [
    { to: '/app', icon: <LayoutDashboard size={18} />, label: 'Command Center', code: 'CC-01' },
    { to: firstFarm ? `/app/farms/${firstFarm}` : '/app', icon: <Factory size={18} />, label: 'Farm Operations', code: 'FO-02' },
    { to: '/app/control', icon: <Sliders size={18} />, label: 'Global Control', code: 'GC-03' },
    { to: '/app/maintenance', icon: <Wrench size={18} />, label: 'Maintenance', code: 'MX-04' },
    { to: '/app/devices', icon: <Sliders size={18} />, label: 'Devices', code: 'DV-05' },
    { to: '/app/alerts', icon: <Bell size={18} />, label: 'Alert Mgt', code: 'AL-06' },
    { to: '/app/analytics', icon: <BarChart3 size={18} />, label: 'Business Intel', code: 'BI-07' },
    { to: '/app/flock', icon: <Bird size={18} />, label: 'Flock Mgmt', code: 'FM-09' },
  ];

  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      backgroundColor: 'var(--bg-void)',
      borderRight: '1px solid var(--border-dim)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0
    }}>
      <div style={{
        padding: '24px 20px',
        borderBottom: '1px solid var(--border-dim)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {branding?.logo_url ? (
          <img 
            src={branding.logo_url} 
            alt={branding.company_name || "Client Logo"} 
            style={{ maxHeight: '82px', maxWidth: '100%', objectFit: 'contain' }} 
          />
        ) : (
          <img 
            src={theme === 'dark' ? logoDark : logoLight} 
            alt="FlelissOPS" 
            style={{ height: '82px', width: 'auto' }} 
          />
        )}
      </div>

      <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {links.map(link => (
          <NavLink
            key={link.code}
            to={link.to}
            end={link.to === '/app'}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 12px',
              borderRadius: '10px',
              textDecoration: 'none',
              color: isActive ? 'var(--on-action)' : 'var(--text-secondary)',
              backgroundColor: isActive ? 'var(--action)' : 'transparent',
              transition: 'background-color 0.15s, color 0.15s',
              fontFamily: 'var(--font-body)',
              fontWeight: isActive ? 600 : 500,
              fontSize: '14.5px'
            })}
          >
            {link.icon}
            <span style={{ flex: 1 }}>{link.label}</span>
            <span className="mono-text" style={{ fontSize: '11px', opacity: 0.7 }}>{link.code}</span>
          </NavLink>
        ))}

        {role === 'admin' && (
          <>
            {/* Divider */}
            <div style={{
              margin: '8px 12px',
              height: 1,
              backgroundColor: 'var(--border-dim)',
            }} />

            {/* Admin nav item */}
            <NavLink
              to="/app/admin"
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                marginBottom: 2,
                textDecoration: 'none',
                borderRadius: 10,
                color: isActive ? 'var(--on-action)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'var(--action)' : 'transparent',
                transition: 'background-color 0.15s, color 0.15s',
              })}
            >
              <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </span>
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: 14.5, fontWeight: 500,
                flex: 1,
              }}>
                Admin
              </span>
              <span style={{
                fontSize: 11,
                opacity: 0.7,
              }}>
                AD-08
              </span>
            </NavLink>
          </>
        )}
      </nav>

      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid var(--border-dim)',
        backgroundColor: 'transparent'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--text-primary)' }}>{user?.username || 'Guest'}</div>
            <div style={{
              fontSize: '12.5px',
              color: 'var(--text-dim)',
              marginTop: '2px'
            }}>
              Role: {user?.role || 'operator'}
            </div>
          </div>
        </div>
        <button onClick={logout} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--danger)' }}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  );
}