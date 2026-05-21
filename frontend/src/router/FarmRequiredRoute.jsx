import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useFarmAccess } from '../context/FarmAccessContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';

export default function FarmRequiredRoute() {
  const { farmAccessReady, isFarmRegistrationRequired } = useFarmAccess();
  const { t } = useI18n();
  const location = useLocation();

  if (!farmAccessReady) {
    return (
      <div className="grid min-h-[40vh] place-items-center px-4">
        <div className="rounded-lg border border-stone-200 bg-white px-6 py-4 text-sm font-semibold text-stone-600 shadow-soft">
          {t('checkingFarmAccess')}
        </div>
      </div>
    );
  }

  if (isFarmRegistrationRequired) {
    return <Navigate to="/farms" replace state={{ farmRequired: true, from: location.pathname }} />;
  }

  return <Outlet />;
}
