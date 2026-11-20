import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import PublicLayout from './components/PublicLayout';
import ProtectedRoute from './components/ProtectedRoute';

// Public Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import AcceptInvite from './pages/AcceptInvite';

// Dashboard Pages
import CommandCenter from './pages/CommandCenter';
import FarmOperations from './pages/FarmOperations';
import HouseControl from './pages/HouseControl';
import GlobalControl from './pages/GlobalControl';
import Maintenance from './pages/Maintenance';
import AlertManagement from './pages/AlertManagement';
import Analytics from './pages/Analytics';
import Devices from './pages/Devices';
import AdminPanel from './pages/AdminPanel';
import FlockManagement from './pages/FlockManagement';

import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
        </Route>

        {/* Protected Dashboard Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<Layout />}>
            <Route index element={<CommandCenter />} />
            <Route path="farms/:farmId" element={<FarmOperations />} />
            <Route path="farms/:farmId/houses/:houseId" element={<HouseControl />} />
            <Route path="control" element={<GlobalControl />} />
            <Route path="maintenance" element={<Maintenance />} />
            <Route path="alerts" element={<AlertManagement />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="devices" element={<Devices />} />
            <Route path="flock" element={<FlockManagement />} />
            <Route
              path="admin"
              element={
                <ProtectedRoute requires="admin">
                  <AdminPanel />
                </ProtectedRoute>
              }
            />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}