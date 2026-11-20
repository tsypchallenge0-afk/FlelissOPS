import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import SuperDashboard from './pages/super/SuperDashboard';
import TenantList from './pages/super/TenantList';
import TenantDetail from './pages/super/TenantDetail';
import TenantOnboarding from './pages/super/TenantOnboarding';
import Login from './pages/Login';
import './styles/global.css';
import { sentence } from './lib/format';

function SuperAdminLayout() {
  const { user, logout, loading } = useAuth();

  if (loading) return <div className="mono-text p-10">Initializing...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Super admin sidebar */}
      <aside style={{
        width: 220, height: '100%', flexShrink: 0,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border-dim)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Brand */}
        <div style={{
          height: 'var(--header-height)',
          padding: '0 20px',
          display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '1px solid var(--border-dim)',
        }}>
          <div style={{
            width: 28, height: 28,
            border: '1.5px solid var(--danger)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)', lineHeight: 1.1 }}>
              Fleliss OPS
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.12em' }}>
              Super admin
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px' }}>
          {[
            { path: '/super',            label: 'Platform Overview', code: 'PO' },
            { path: '/super/clients',    label: 'Clients',           code: 'CL' },
            { path: '/super/onboarding', label: 'New Client',        code: 'NC' },
          ].map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/super'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', marginBottom: 2,
                textDecoration: 'none', borderRadius: 2,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: isActive ? 'var(--bg-surface)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.15s',
              })}
            >
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', flex: 1 }}>
                {item.label}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>
                {item.code}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '12px', borderTop: '1px solid var(--border-dim)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 6 }}>
            {sentence(user?.username)}
          </div>
          <button onClick={logout} style={{
            width: '100%', padding: '6px 0',
            fontFamily: 'var(--font-mono)', fontSize: 10,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            border: '1px solid var(--border-dim)',
            background: 'transparent', color: 'var(--text-dim)',
            cursor: 'pointer', borderRadius: 2,
          }}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          height: 'var(--header-height)', flexShrink: 0,
          borderBottom: '1px solid var(--border-dim)',
          background: 'var(--bg-panel)',
          display: 'flex', alignItems: 'center',
          padding: '0 24px',
          gap: 12,
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
            Sys://Fleliss-ops-platform
          </span>
          <span style={{ color: 'var(--border-mid)' }}>|</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.08em' }}>
            Super admin portal
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Routes>
            <Route path="/"                 element={<SuperDashboard />} />
            <Route path="clients"           element={<TenantList />} />
            <Route path="clients/:id"       element={<TenantDetail />} />
            <Route path="onboarding"        element={<TenantOnboarding />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function SuperAdminApp() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login"  element={<Login superAdmin />} />
          <Route path="/super/*" element={<SuperAdminLayout />} />
          <Route path="*"       element={<Navigate to="/super" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
