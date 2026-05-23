import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute() {
  const { isAuthenticated, sessionReady, user } = useAuth();
  const location = useLocation();
  const accountStatus = user?.account_status || (user?.is_active === false ? 'disabled' : 'active');
  const accountRestricted = isAuthenticated && accountStatus !== 'active';

  if (!sessionReady) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#fbfbf9] px-4">
        <div className="rounded-lg border border-stone-200 bg-white px-6 py-4 text-sm font-semibold text-stone-600 shadow-soft">
          Restoring your secure session...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (accountRestricted && location.pathname !== '/account/suspended') {
    return <Navigate to="/account/suspended" replace />;
  }

  if (!accountRestricted && location.pathname === '/account/suspended') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
