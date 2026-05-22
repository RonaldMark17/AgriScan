import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';

export default function AdminRequiredRoute() {
  const { sessionReady, user } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (!sessionReady) {
    return (
      <div className="grid min-h-[40vh] place-items-center px-4">
        <div className="rounded-lg border border-stone-200 bg-white px-6 py-4 text-sm font-semibold text-stone-600 shadow-soft">
          {t('checkingAdminAccess')}
        </div>
      </div>
    );
  }

  const roleName = typeof user?.role === 'string' ? user.role : user?.role?.name || '';
  if ((roleName || '').toLowerCase() !== 'admin') {
    return <Navigate to="/" replace state={{ unauthorized: true, from: location.pathname }} />;
  }

  return <Outlet />;
}
