import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import '../styles/global.css';

export default function Layout() {
  const { user, loading } = useAuth();

  if (loading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-void)'}}>Initializing session...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-void)' }}>
        <Topbar />
        <main style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          <Outlet />
        </main>
      </div>
      <Toaster position="bottom-right" theme="system" />
    </div>
  );
}