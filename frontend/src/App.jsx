import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell.jsx';
import ProtectedRoute from './router/ProtectedRoute.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Farms from './pages/Farms.jsx';
import Login from './pages/Login.jsx';
import MfaChallenge from './pages/MfaChallenge.jsx';
import MfaSetup from './pages/MfaSetup.jsx';
import PlantDiseaseDetector from './pages/PlantDiseaseDetector.jsx';
import Register from './pages/Register.jsx';
import Reports from './pages/Reports.jsx';
import Scan from './pages/Scan.jsx';
import SecuritySettings from './pages/SecuritySettings.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/mfa" element={<MfaChallenge />} />
        <Route path="/mfa/setup" element={<MfaSetup />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="/farms" element={<Farms />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/disease-detector" element={<PlantDiseaseDetector />} />
            <Route path="/marketplace" element={<Navigate to="/scan" replace />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings/security" element={<SecuritySettings />} />
            <Route path="/admin/users" element={<AdminUsers />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
