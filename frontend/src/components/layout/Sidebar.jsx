import {
  Languages,
  LayoutGrid,
  Leaf,
  MapPinned,
  ScanLine,
  Settings,
  UsersRound,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useI18n } from '../../context/I18nContext.jsx';

function NavItem({ to, icon: Icon, children, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition xl:gap-4 xl:px-4 ${
          isActive ? 'bg-leaf-50 text-leaf-800 shadow-[inset_3px_0_0_#15803d]' : 'text-stone-500 hover:bg-stone-50 hover:text-stone-900'
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
  const { language, setLanguage, t } = useI18n();
  const roleName = typeof user?.role === 'string' ? user.role : user?.role?.name;

  return (
    <aside className="fixed bottom-0 left-0 top-[72px] z-20 hidden w-64 flex-col overflow-y-auto border-r border-stone-200/90 bg-white/95 backdrop-blur lg:flex">
      <nav className="space-y-1.5 p-3 xl:p-4" aria-label="Primary navigation">
        <NavItem to="/" icon={LayoutGrid} end>{t('dashboard')}</NavItem>
        <NavItem to="/farms" icon={MapPinned}>{t('farms')}</NavItem>
        <NavItem to="/scan" icon={ScanLine}>{t('manualScan')}</NavItem>
        <NavItem to="/disease-detector" icon={Leaf}>{t('diseaseDetector')}</NavItem>
        <NavItem to="/settings/security" icon={Settings}>{t('security')}</NavItem>
        {roleName === 'admin' && <NavItem to="/admin/users" icon={UsersRound}>{t('users')}</NavItem>}
      </nav>

      <div className="mt-auto border-t border-stone-200 p-3 xl:p-4">
        <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-2">
          <div className="mb-2 flex items-center gap-2 px-1 text-xs font-bold uppercase text-stone-500">
            <Languages className="h-4 w-4" />
            <span>{t('language')}</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              className={`focus-ring rounded-lg px-3 py-2 text-xs font-bold transition ${
                language === 'en' ? 'bg-white text-leaf-800 shadow-sm ring-1 ring-leaf-100' : 'text-stone-600 hover:bg-white'
              }`}
              type="button"
              onClick={() => setLanguage('en')}
              aria-pressed={language === 'en'}
            >
              EN
            </button>
            <button
              className={`focus-ring rounded-lg px-3 py-2 text-xs font-bold transition ${
                language === 'fil' ? 'bg-white text-leaf-800 shadow-sm ring-1 ring-leaf-100' : 'text-stone-600 hover:bg-white'
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
