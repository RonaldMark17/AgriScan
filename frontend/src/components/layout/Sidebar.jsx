import {
  Languages,
  LayoutGrid,
  Leaf,
  MapPinned,
  ScanLine,
  Settings,
  UsersRound,
} from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useFarmAccess } from '../../context/FarmAccessContext.jsx';
import { useI18n } from '../../context/I18nContext.jsx';
import { routeRequiresRegisteredFarm } from '../../utils/farmAccess.js';

function NavItem({ to, icon: Icon, children, end = false, disabled = false, disabledState = null, disabledTitle = '' }) {
  if (disabled) {
    return (
      <Link
        to="/farms"
        state={disabledState}
        title={disabledTitle}
        className="group relative flex min-h-10 items-center gap-3 rounded-lg border border-dashed border-stone-200 bg-stone-50/90 px-3 py-2.5 text-sm font-semibold text-stone-400 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white xl:gap-4 xl:px-4"
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{children}</span>
      </Link>
    );
  }

  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white xl:gap-4 xl:px-4 ${
          isActive ? 'border border-leaf-100 bg-leaf-50 text-leaf-800' : 'border border-transparent text-stone-500 hover:bg-stone-50 hover:text-stone-900'
        }`
      }
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{children}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const { user } = useAuth();
  const { farmAccessReady, isFarmRegistrationRequired } = useFarmAccess();
  const { language, setLanguage, t } = useI18n();
  const roleName = typeof user?.role === 'string' ? user.role : user?.role?.name;
  const lockMainFeatures = farmAccessReady && isFarmRegistrationRequired;

  return (
    <aside className="sidebar-shell fixed bottom-0 left-0 z-20 hidden flex-col overflow-y-auto border-r border-stone-200/90 bg-white lg:flex">
      <nav className="space-y-1.5 p-3 xl:p-4" aria-label="Primary navigation">
        <NavItem
          to="/"
          icon={LayoutGrid}
          end
          disabled={lockMainFeatures && routeRequiresRegisteredFarm('/')}
          disabledState={{ farmRequired: true, from: '/' }}
          disabledTitle={t('registerFarmFirst')}
        >
          {t('dashboard')}
        </NavItem>
        <NavItem to="/farms" icon={MapPinned}>{t('farms')}</NavItem>
        <NavItem
          to="/scan"
          icon={ScanLine}
          disabled={lockMainFeatures && routeRequiresRegisteredFarm('/scan')}
          disabledState={{ farmRequired: true, from: '/scan' }}
          disabledTitle={t('registerFarmFirst')}
        >
          {t('manualScan')}
        </NavItem>
        <NavItem
          to="/disease-detector"
          icon={Leaf}
          disabled={lockMainFeatures && routeRequiresRegisteredFarm('/disease-detector')}
          disabledState={{ farmRequired: true, from: '/disease-detector' }}
          disabledTitle={t('registerFarmFirst')}
        >
          {t('diseaseDetector')}
        </NavItem>
        <NavItem to="/settings/security" icon={Settings}>{t('security')}</NavItem>
        {roleName === 'admin' && <NavItem to="/admin/users" icon={UsersRound}>{t('users')}</NavItem>}
      </nav>

      <div className="mt-auto border-t border-stone-200 p-3 xl:p-4">
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-2">
          <div className="mb-2 flex items-center gap-2 px-1 text-xs font-bold uppercase text-stone-500">
            <Languages className="h-4 w-4" />
            <span>{t('language')}</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              className={`focus-ring rounded-lg px-3 py-2 text-xs font-bold transition ${
                language === 'en' ? 'border border-leaf-100 bg-white text-leaf-800' : 'border border-transparent text-stone-600 hover:bg-white'
              }`}
              type="button"
              onClick={() => setLanguage('en')}
              aria-pressed={language === 'en'}
            >
              EN
            </button>
            <button
              className={`focus-ring rounded-lg px-3 py-2 text-xs font-bold transition ${
                language === 'fil' ? 'border border-leaf-100 bg-white text-leaf-800' : 'border border-transparent text-stone-600 hover:bg-white'
              }`}
              type="button"
              onClick={() => setLanguage('fil')}
              aria-pressed={language === 'fil'}
            >
              PH
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
