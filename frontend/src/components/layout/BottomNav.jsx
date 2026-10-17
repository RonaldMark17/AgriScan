import { Bell, Camera, FileText, FlaskConical, Grid2X2, MapPinned, ScanLine, Settings, ShieldCheck, Sprout, UsersRound, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useFarmAccess } from '../../context/FarmAccessContext.jsx';
import { routeRequiresRegisteredFarm } from '../../utils/farmAccess.js';

const farmerItems = [
  { to: '/', Icon: Grid2X2, label: 'Dashboard', end: true },
  { to: '/crop-management', Icon: Sprout, label: 'Crops' },
  { to: '/farms', Icon: MapPinned, label: 'Farms' },
  { to: '/reports', Icon: FileText, label: 'Reports' },
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
  const navigate = useNavigate();
  const { farmAccessReady, isFarmRegistrationRequired } = useFarmAccess();
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const roleName = roleNameFromUser(user);
  const isAdmin = roleName === 'admin' || user?.email?.toLowerCase() === 'admin@agriscanproject.com';
  const items = isAdmin ? adminItems : farmerItems;
  const lockMainFeatures = farmAccessReady && isFarmRegistrationRequired;

  const navItemClass = (isActive) =>
    `bottom-nav-item flex min-h-[3.6rem] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[10px] font-bold transition-all duration-200 ${
      isActive
        ? 'bg-emerald-50 text-emerald-800 shadow-sm'
        : 'text-slate-500 hover:text-slate-900'
    }`;
  const lockedNavItemClass =
    'bottom-nav-item flex min-h-[3.6rem] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[10px] font-bold text-slate-300';

  return (
    <>
      <nav
        className="bottom-nav fixed bottom-0 left-0 right-0 z-40 grid shrink-0 items-center border-t border-slate-200/80 bg-white/95 px-2 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden"
        aria-label="Mobile navigation"
        style={{ gridTemplateColumns: `repeat(${items.length + (isAdmin ? 0 : 1)}, minmax(0, 1fr))` }}
      >
        {items.slice(0, 2).map(({ to, Icon, label, end }) => {
          const isLocked = !isAdmin && lockMainFeatures && routeRequiresRegisteredFarm(to);
          if (isLocked) {
            return (
              <Link key={to} to="/farms" state={{ farmRequired: true, from: to }} title="Register your first farm" className={lockedNavItemClass}>
                <Icon className="h-5 w-5 shrink-0 opacity-40" />
                <span className="bottom-nav-label max-w-full truncate">{label}</span>
              </Link>
            );
          }
          return (
            <NavLink key={to} to={to} end={end} title={label} className={({ isActive }) => navItemClass(isActive)}>
              {({ isActive }) => (
                <>
                  <span className={`grid h-7 w-7 place-items-center rounded-xl transition-all ${isActive ? 'bg-emerald-600 text-white shadow-sm' : ''}`}>
                    <Icon className="h-4 w-4 shrink-0" />
                  </span>
                  <span className="bottom-nav-label max-w-full truncate">{label}</span>
                </>
              )}
            </NavLink>
          );
        })}

        {/* Center Floating Quick-Scan Button for Farmers */}
        {!isAdmin && (
          <button
            type="button"
            onClick={() => setScanModalOpen(true)}
            className="flex min-h-[3.6rem] min-w-0 flex-col items-center justify-center gap-1 -mt-4"
            aria-label="Quick Scan"
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-600/40 border-2 border-white transition-transform active:scale-95">
              <ScanLine className="h-6 w-6 shrink-0" />
            </span>
            <span className="text-[10px] font-extrabold text-emerald-800">Scan</span>
          </button>
        )}

        {items.slice(2).map(({ to, Icon, label, end }) => {
          const isLocked = !isAdmin && lockMainFeatures && routeRequiresRegisteredFarm(to);
          if (isLocked) {
            return (
              <Link key={to} to="/farms" state={{ farmRequired: true, from: to }} title="Register your first farm" className={lockedNavItemClass}>
                <Icon className="h-5 w-5 shrink-0 opacity-40" />
                <span className="bottom-nav-label max-w-full truncate">{label}</span>
              </Link>
            );
          }
          return (
            <NavLink key={to} to={to} end={end} title={label} className={({ isActive }) => navItemClass(isActive)}>
              {({ isActive }) => (
                <>
                  <span className={`grid h-7 w-7 place-items-center rounded-xl transition-all ${isActive ? 'bg-emerald-600 text-white shadow-sm' : ''}`}>
                    <Icon className="h-4 w-4 shrink-0" />
                  </span>
                  <span className="bottom-nav-label max-w-full truncate">{label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Quick Scan Sheet */}
      {scanModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/60 p-3 backdrop-blur-sm sm:items-center"
            onClick={() => setScanModalOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-3xl border border-white/80 bg-white p-5 shadow-2xl animate-in fade-in slide-in-from-bottom-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                    <ScanLine className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-extrabold text-stone-950 text-sm">Quick Diagnostics</h3>
                    <p className="text-xs text-stone-500">Choose scan mode</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScanModalOpen(false)}
                  className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setScanModalOpen(false);
                    navigate('/disease-detector');
                  }}
                  className="flex items-center gap-4 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50/80 to-teal-50/40 p-4 text-left transition hover:border-emerald-300 hover:shadow-md"
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
                    <Camera className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="font-extrabold text-stone-950 text-sm">AI Disease Detector</p>
                    <p className="text-xs text-stone-600 mt-0.5">Capture leaf photo to identify diseases and receive instant treatment guide.</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setScanModalOpen(false);
                    navigate('/scan');
                  }}
                  className="flex items-center gap-4 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50/80 to-indigo-50/40 p-4 text-left transition hover:border-sky-300 hover:shadow-md"
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-600 text-white shadow-md shadow-sky-600/30">
                    <FlaskConical className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="font-extrabold text-stone-950 text-sm">Manual Soil Scan</p>
                    <p className="text-xs text-stone-600 mt-0.5">Input NPK, pH & moisture readings to get tailored crop suitability recommendations.</p>
                  </div>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
