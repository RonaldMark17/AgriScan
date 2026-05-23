import { Bell, FileText, Grid2X2, MapPinned, Settings, ShieldCheck, Sprout, UsersRound } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useFarmAccess } from '../../context/FarmAccessContext.jsx';
import { routeRequiresRegisteredFarm } from '../../utils/farmAccess.js';

const farmerItems = [
  { to: '/', Icon: Grid2X2, label: 'Dashboard', end: true },
  { to: '/crop-management', Icon: Sprout, label: 'Crops' },
  { to: '/reports', Icon: FileText, label: 'Reports' },
  { to: '/notifications', Icon: Bell, label: 'Alerts' },
  { to: '/settings', Icon: Settings, label: 'Settings' },
];

const adminItems = [
  { to: '/', Icon: Grid2X2, label: 'Dashboard', end: true },
  { to: '/farms', Icon: MapPinned, label: 'Farmers' },
  { to: '/admin/users', Icon: UsersRound, label: 'Users' },
  { to: '/audit-logs', Icon: ShieldCheck, label: 'Audit' },
  { to: '/settings', Icon: Settings, label: 'Settings' },
];

function roleNameFromUser(user) {
  const directRole = typeof user?.role === 'string' ? user.role : user?.role?.name;
  return directRole ? directRole.toLowerCase() : '';
}

export default function BottomNav() {
  const { user } = useAuth();
  const { farmAccessReady, isFarmRegistrationRequired } = useFarmAccess();
  const roleName = roleNameFromUser(user);
  const isAdmin = roleName === 'admin' || user?.email?.toLowerCase() === 'admin@agriscanproject.com';
  const items = isAdmin ? adminItems : farmerItems;
  const lockMainFeatures = farmAccessReady && isFarmRegistrationRequired;

  const navItemClass = (isActive) =>
    `bottom-nav-item flex min-h-[3.35rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-0.5 py-1 text-[9px] font-bold leading-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300 min-[390px]:text-[10px] sm:min-h-[3.5rem] sm:gap-1 sm:px-2 sm:text-[11px] ${
      isActive ? 'border-leaf-200 bg-leaf-50 text-leaf-800' : 'border-transparent text-stone-500 hover:border-stone-200 hover:bg-stone-50'
    }`;
  const lockedNavItemClass =
    'bottom-nav-item flex min-h-[3.35rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-stone-200 bg-stone-50/90 px-0.5 py-1 text-[9px] font-bold leading-tight text-stone-400 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300 min-[390px]:text-[10px] sm:min-h-[3.5rem] sm:gap-1 sm:px-2 sm:text-[11px]';

  return (
    <nav
      className="bottom-nav relative z-30 grid shrink-0 items-stretch border-t border-stone-200 bg-white/95 px-1 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_24px_rgba(15,23,42,0.06)] backdrop-blur sm:px-2 lg:hidden"
      aria-label="Mobile navigation"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map(({ to, Icon, label, end }) => {
        const isLocked = !isAdmin && lockMainFeatures && routeRequiresRegisteredFarm(to);

        if (isLocked) {
          return (
            <Link key={to} to="/farms" state={{ farmRequired: true, from: to }} title="Register your first farm" className={lockedNavItemClass}>
              <Icon className="bottom-nav-icon h-5 w-5 shrink-0" />
              <span className="bottom-nav-label max-w-full truncate">{label}</span>
            </Link>
          );
        }

        return (
          <NavLink key={to} to={to} end={end} title={label} className={({ isActive }) => navItemClass(isActive)}>
            <Icon className="bottom-nav-icon h-5 w-5 shrink-0" />
            <span className="bottom-nav-label max-w-full truncate">{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
