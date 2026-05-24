import { useLayoutEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './components/layout/AppShell.jsx';
import ProtectedRoute from './router/ProtectedRoute.jsx';
import FarmRequiredRoute from './router/FarmRequiredRoute.jsx';
import AccountSuspended from './pages/AccountSuspended.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AdminRequiredRoute from './router/AdminRequiredRoute.jsx';
import Analytics from './pages/Analytics.jsx';
import AuditLogs from './pages/AuditLogs.jsx';
import CropManagement from './pages/CropManagement.jsx';
import DashboardHome from './pages/DashboardHome.jsx';
import Farms from './pages/Farms.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Login from './pages/Login.jsx';
import MfaChallenge from './pages/MfaChallenge.jsx';
import MfaSetup from './pages/MfaSetup.jsx';
import Notifications from './pages/Notifications.jsx';
import PlantDiseaseDetector from './pages/PlantDiseaseDetector.jsx';
import Profile from './pages/Profile.jsx';
import Register from './pages/Register.jsx';
import Reports from './pages/Reports.jsx';
import Scan from './pages/Scan.jsx';
import SecuritySettings from './pages/SecuritySettings.jsx';

function ScrollToPageTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector('.app-content')?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToPageTop />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/register" element={<Register />} />
        <Route path="/mfa" element={<MfaChallenge />} />
        <Route path="/mfa/setup" element={<MfaSetup />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/account/suspended" element={<AccountSuspended />} />
          <Route element={<AppShell />}>
            <Route index element={<DashboardHome />} />
            <Route path="/farms" element={<Farms />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<SecuritySettings />} />
            <Route path="/settings/security" element={<SecuritySettings />} />
            <Route element={<FarmRequiredRoute />}>
              <Route path="/crop-management" element={<CropManagement />} />
              <Route path="/scan" element={<Scan />} />
              <Route path="/disease-detector" element={<PlantDiseaseDetector />} />
              <Route path="/marketplace" element={<Navigate to="/crop-management" replace />} />
              <Route path="/reports" element={<Reports />} />
            </Route>
            <Route element={<AdminRequiredRoute />}>
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/audit-logs" element={<AuditLogs />} />
              <Route path="/analytics" element={<Analytics />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
