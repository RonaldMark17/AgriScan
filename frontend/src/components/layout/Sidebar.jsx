import {
  Languages,
  LayoutGrid,
  Leaf,
  MapPinned,
  Mic,
  ScanLine,
  Settings,
  UsersRound,
} from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useI18n } from '../../context/I18nContext.jsx';

function NavItem({ to, icon: Icon, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-4 rounded-lg px-4 py-4 text-base font-semibold transition ${
          isActive ? 'bg-leaf-50 text-leaf-700' : 'text-stone-500 hover:bg-stone-50 hover:text-stone-900'
        }`
      }
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span>{children}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const { user } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const role = user?.role;

  return (
    <aside className="fixed bottom-10 left-0 top-[72px] z-20 hidden w-64 flex-col border-r border-stone-200 bg-white lg:flex">
      <nav className="space-y-3 p-5">
        <NavItem to="/" icon={LayoutGrid}>{t('dashboard')}</NavItem>
        <NavItem to="/farms" icon={MapPinned}>{t('farms')}</NavItem>
        <NavItem to="/scan" icon={ScanLine}>{t('manualScan')}</NavItem>
        <NavItem to="/disease-detector" icon={Leaf}>{t('diseaseDetector')}</NavItem>
        <NavItem to="/settings/security" icon={Settings}>{t('security')}</NavItem>
        {role === 'admin' && <NavItem to="/admin/users" icon={UsersRound}>{t('users')}</NavItem>}
      </nav>

      <div className="mt-auto border-t border-stone-200 p-5">
        <div className="rounded-lg bg-stone-50 p-4">
          <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase text-stone-500">
            <span>{t('language')}</span>
            <Languages className="h-4 w-4" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                language === 'en' ? 'bg-leaf-600 text-white' : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
              type="button"
              onClick={() => setLanguage('en')}
              aria-pressed={language === 'en'}
            >
              EN
            </button>
            <button
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                language === 'fil' ? 'bg-leaf-600 text-white' : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
              type="button"
              onClick={() => setLanguage('fil')}
              aria-pressed={language === 'fil'}
            >
              PH
            </button>
          </div>
        </div>
        <Link
          to="/settings/security"
          className="mt-6 flex items-center gap-3 rounded-lg px-3 py-2 text-stone-500 transition hover:bg-stone-50 hover:text-stone-900"
        >
          <Mic className="h-5 w-5" />
          <span className="text-sm font-medium">{t('voiceHelp')}</span>
        </Link>
      </div>
    </aside>
  );
}
