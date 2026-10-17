import {
  BarChart3,
  Bell,
  FileText,
  FlaskConical,
  LayoutGrid,
  MapPinned,
  PanelLeftClose,
  PanelLeftOpen,
  ScanLine,
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
  { to: '/disease-detector', icon: ScanLine, label: 'Disease Detector' },
  { to: '/scan', icon: FlaskConical, label: 'Soil Scan' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/audit-logs', icon: ShieldCheck, label: 'Audit Logs' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

const farmerItems = [
  { to: '/', icon: LayoutGrid, label: 'Dashboard', end: true },
  { to: '/farms', icon: MapPinned, label: 'My Farms' },
  { to: '/crop-management', icon: Sprout, label: 'Crop Management' },
  { to: '/disease-detector', icon: ScanLine, label: 'Disease Detector' },
  { to: '/scan', icon: FlaskConical, label: 'Soil Scan' },
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
        className="sidebar-nav-item group relative flex min-h-11 items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-400 transition"
      >
        <span className="sidebar-nav-icon grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400">
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
        `sidebar-nav-item group relative flex min-h-11 items-center gap-3 rounded-2xl border px-3.5 py-2 text-xs font-bold transition-all duration-200 ${
          isActive
            ? 'border-emerald-200/90 bg-gradient-to-r from-emerald-50 to-white text-emerald-900 shadow-sm shadow-emerald-600/5'
            : 'border-transparent text-slate-600 hover:border-slate-200/60 hover:bg-white hover:text-slate-900'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`sidebar-nav-icon grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-all ${
              isActive
                ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-600/30'
                : 'bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-700'
            }`}
          >
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
    <aside className="sidebar-shell fixed bottom-0 left-0 z-20 hidden flex-col overflow-y-auto border-r border-slate-200/80 bg-gradient-to-b from-white via-slate-50/40 to-slate-50/80 lg:flex">
      <div className="sidebar-panel-header flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <div className="sidebar-nav-label min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Workspace</p>
          <p className="truncate text-sm font-extrabold text-slate-900">{isAdmin ? 'Admin Console' : 'Farmer Hub'}</p>
        </div>
        <button
          className="btn-icon h-8 w-8 rounded-xl text-slate-500 hover:text-slate-900"
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="space-y-1.5 p-3 pt-2" aria-label="Primary navigation">
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

      {/* Quick Launch Card for Farmers */}
      {!collapsed && !isAdmin && (
        <div className="mt-auto p-3.5">
          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900 to-stone-900 p-4 text-white shadow-lg shadow-emerald-950/15">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Quick Diagnostic</p>
            <p className="mt-1 text-xs text-emerald-100/80 leading-relaxed">Scan crop leaves with real-time AI computer vision.</p>
            <Link
              to="/disease-detector"
              className="mt-3 flex h-9 items-center justify-center rounded-xl bg-emerald-500 text-xs font-bold text-white shadow-md shadow-emerald-500/30 transition hover:bg-emerald-400"
            >
              Launch Camera
            </Link>
          </div>
        </div>
      )}

      <div className="h-4 shrink-0" />
    </aside>
  );
}
