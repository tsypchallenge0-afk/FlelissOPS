import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Skeleton from './Skeleton';

export default function ProtectedRoute({ requires = null, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Skeleton height={56} />
        <div style={{ display: 'flex', gap: 12 }}>
          <Skeleton width={220} height="calc(100vh - 80px)" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Skeleton height={200} />
            <Skeleton height={300} />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  const ROLE_RANK = { operator: 1, supervisor: 2, admin: 3 };
  if (requires && ROLE_RANK[user?.role ?? 'operator'] < ROLE_RANK[requires]) {
    return <Navigate to="/app" replace />;
  }

  // Support both <Outlet /> pattern and direct children pattern
  return children ?? <Outlet />;
}
