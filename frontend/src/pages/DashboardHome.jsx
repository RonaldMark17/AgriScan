import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useFarmAccess } from '../context/FarmAccessContext.jsx';
import AdminDashboard from './AdminDashboard.jsx';
import Dashboard from './Dashboard.jsx';

export default function DashboardHome() {
  const { user } = useAuth();
  const { farmAccessReady, isFarmRegistrationRequired } = useFarmAccess();
  const roleName = typeof user?.role === 'string' ? user.role : user?.role?.name || 'farmer';

  if (roleName.toLowerCase() === 'admin') {
    return <AdminDashboard />;
  }

  if (!farmAccessReady) {
    return (
      <div className="grid min-h-[40vh] place-items-center px-4">
        <div className="rounded-lg border border-stone-200 bg-white px-6 py-4 text-sm font-semibold text-stone-600 shadow-soft">
          Checking your farm access...
        </div>
      </div>
    );
  }

  if (isFarmRegistrationRequired) {
    return <Navigate to="/farms" replace state={{ farmRequired: true, from: '/' }} />;
  }

  return <Dashboard />;
}
