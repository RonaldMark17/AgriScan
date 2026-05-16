import { BarChart3, Grid2X2, Leaf, MapPinned, ScanLine, Settings, UsersRound } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useI18n } from '../../context/I18nContext.jsx';

const baseItems = [
  { to: '/', Icon: Grid2X2, labelKey: 'home', end: true },
  { to: '/farms', Icon: MapPinned, labelKey: 'farms' },
  { type: 'scan' },
  { to: '/reports', Icon: BarChart3, labelKey: 'reports' },
  { to: '/settings/security', Icon: Settings, labelKey: 'settings' },
];

const adminItems = [
  { to: '/', Icon: Grid2X2, labelKey: 'home', end: true },
  { to: '/farms', Icon: MapPinned, labelKey: 'farms' },
  { type: 'scan' },
  { to: '/admin/users', Icon: UsersRound, labelKey: 'users' },
  { to: '/settings/security', Icon: Settings, labelKey: 'settings' },
];

const scanOptions = [
  { to: '/scan', Icon: ScanLine, labelKey: 'manualScan' },
  { to: '/disease-detector', Icon: Leaf, labelKey: 'diseaseDetector' },
];

function roleNameFromUser(user) {
  const directRole = typeof user?.role === 'string' ? user.role : user?.role?.name;
  if (directRole) return directRole.toLowerCase();

  try {
    const storedUser = JSON.parse(localStorage.getItem('agriscan_user') || 'null');
    const storedRole = typeof storedUser?.role === 'string' ? storedUser.role : storedUser?.role?.name;
    return storedRole ? storedRole.toLowerCase() : '';
  } catch {
    return '';
  }
}

export default function BottomNav() {
  const { user } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const navRef = useRef(null);
  const [scanMenuOpen, setScanMenuOpen] = useState(false);
  const roleName = roleNameFromUser(user);
  const isAdmin = roleName === 'admin' || user?.email?.toLowerCase() === 'admin@agriscanproject.com';
  const items = isAdmin ? adminItems : baseItems;
  const scanMenuId = 'mobile-scan-menu';
  const isScanActive = location.pathname.startsWith('/scan') || location.pathname.startsWith('/disease-detector');

  useEffect(() => {
    setScanMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!scanMenuOpen) return undefined;

    function handlePointerDown(event) {
      if (!navRef.current?.contains(event.target)) {
        setScanMenuOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setScanMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [scanMenuOpen]);

  const navItemClass = (isActive) =>
    `flex min-h-[3.35rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1 text-[9px] font-bold leading-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300 min-[390px]:text-[10px] sm:min-h-[3.5rem] sm:gap-1 sm:px-2 sm:text-[11px] ${
      isActive ? 'bg-leaf-50 text-leaf-800' : 'text-stone-500 hover:bg-stone-50'
    }`;
  const scanNavItemClass = (isActive) =>
    `relative -mt-0.5 flex min-h-[3.5rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-leaf-700 bg-leaf-700 px-0.5 py-1 text-[9px] font-bold leading-tight text-white transition hover:bg-leaf-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white min-[390px]:text-[10px] sm:min-h-[3.65rem] sm:gap-1 sm:px-2 sm:text-[11px] ${
      isActive ? 'ring-2 ring-leaf-200 ring-offset-1 ring-offset-white' : ''
    }`;

  return (
    <nav
      ref={navRef}
      className="bottom-nav fixed bottom-0 left-0 right-0 z-30 grid items-stretch border-t border-stone-200 bg-white px-1 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 sm:px-2 lg:hidden"
      aria-label="Mobile navigation"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {scanMenuOpen ? (
        <div
          id={scanMenuId}
          className="scan-menu-popover absolute bottom-[calc(100%+0.45rem)] left-1/2 z-40 grid w-[min(19rem,calc(100vw-1.5rem))] -translate-x-1/2 grid-cols-2 gap-2 rounded-lg border border-stone-200 bg-white p-2 shadow-[0_8px_18px_rgba(15,23,42,0.08)]"
          role="menu"
          aria-label={t('scan')}
        >
          {scanOptions.map(({ to, Icon, labelKey }) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-center text-[11px] font-bold leading-tight text-stone-600 transition hover:bg-leaf-50 hover:text-leaf-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300"
              role="menuitem"
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate">{t(labelKey)}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {items.map((item) => {
        if (item.type === 'scan') {
          return (
            <button
              key="scan-menu"
              type="button"
              title={t('scan')}
              className={scanNavItemClass(isScanActive || scanMenuOpen)}
              aria-controls={scanMenuId}
              aria-expanded={scanMenuOpen}
              aria-haspopup="menu"
              onClick={() => setScanMenuOpen((current) => !current)}
            >
              <ScanLine className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate">{t('scan')}</span>
            </button>
          );
        }

        const { to, Icon, labelKey, end } = item;
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={t(labelKey)}
            className={({ isActive }) => navItemClass(isActive)}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="max-w-full truncate">{t(labelKey)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
