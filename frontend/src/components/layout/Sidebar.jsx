import {
  BarChart3,
  Bell,
  FileText,
  LayoutGrid,
  MapPinned,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Sprout,
  UsersRound,
} from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useFarmAccess } from '../../context/FarmAccessContext.jsx';
import { routeRequiresRegisteredFarm } from '../../utils/farmAccess.js';

const adminItems = [
  { to: '/', icon: LayoutGrid, label: 'Dashboard', end: true },
  { to: '/farms', icon: MapPinned, label: 'Farmers' },
  { to: '/admin/users', icon: UsersRound, label: 'User Management' },
  { to: '/crop-management', icon: Sprout, label: 'Crop Management' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/audit-logs', icon: ShieldCheck, label: 'Audit Logs' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

const farmerItems = [
  { to: '/', icon: LayoutGrid, label: 'Dashboard', end: true },
  { to: '/crop-management', icon: Sprout, label: 'Crop Management' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

function NavItem({ to, icon: Icon, label, end = false, disabled = false }) {
  if (disabled) {
    return (
      <Link
        to="/farms"
        state={{ farmRequired: true, from: to }}
        title="Register your first farm to unlock this feature."
        aria-label="Register your first farm to unlock this feature."
        className="sidebar-nav-item group relative flex min-h-10 items-center gap-3 rounded-lg border border-dashed border-stone-200 bg-stone-50/90 px-3 py-2.5 text-sm font-semibold text-stone-400 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white xl:gap-4 xl:px-4"
      >
        <span className="sidebar-nav-icon grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/80 text-stone-400">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="sidebar-nav-label min-w-0 truncate">{label}</span>
      </Link>
    );
  }

  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        `sidebar-nav-item group relative flex min-h-10 items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white xl:gap-4 xl:px-4 ${
          isActive ? 'border-leaf-200 bg-leaf-50 text-leaf-900 ring-1 ring-leaf-100' : 'border-transparent text-stone-600 hover:border-stone-200 hover:bg-white hover:text-stone-950'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`sidebar-nav-icon grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isActive ? 'bg-white text-leaf-700 ring-1 ring-leaf-100' : 'bg-stone-100 text-stone-500 group-hover:bg-leaf-50 group-hover:text-leaf-700'}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="sidebar-nav-label min-w-0 truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ collapsed = false, onToggleCollapsed }) {
  const { user } = useAuth();
  const { farmAccessReady, isFarmRegistrationRequired } = useFarmAccess();
  const roleName = (typeof user?.role === 'string' ? user.role : user?.role?.name || 'farmer').toLowerCase();
  const isAdmin = roleName === 'admin';
  const items = isAdmin ? adminItems : farmerItems;
  const lockMainFeatures = farmAccessReady && isFarmRegistrationRequired;

  return (
    <aside className="sidebar-shell fixed bottom-0 left-0 z-20 hidden flex-col overflow-y-auto border-r border-stone-200/90 bg-[#fbfcf8] lg:flex">
      <div className="sidebar-panel-header flex items-center justify-between gap-2 px-3 pb-2 pt-3 xl:px-4">
        <div className="sidebar-nav-label min-w-0">
          <p className="text-[11px] font-bold uppercase text-stone-400">Workspace</p>
          <p className="truncate text-sm font-bold text-stone-900">{isAdmin ? 'Admin Console' : 'Farmer Hub'}</p>
        </div>
        <button
          className="btn-icon h-9 w-9"
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="space-y-1.5 p-3 pt-1 xl:p-4 xl:pt-2" aria-label="Primary navigation">
        {items.map((item) => (
          <NavItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            end={item.end}
            disabled={!isAdmin && lockMainFeatures && routeRequiresRegisteredFarm(item.to)}
          />
        ))}
      </nav>

      <div className="mt-auto h-4 shrink-0" />
    </aside>
  );
}
