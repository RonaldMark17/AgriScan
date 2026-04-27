import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute() {
  const { isAuthenticated, sessionReady } = useAuth();
  const location = useLocation();

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

  return <Outlet />;
}
