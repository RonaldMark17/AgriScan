import { Grid2X2, Leaf, MapPinned, ScanLine, Settings } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useI18n } from '../../context/I18nContext.jsx';

const items = [
  ['/', Grid2X2, 'home'],
  ['/farms', MapPinned, 'farms'],
  ['/scan', ScanLine, 'scan'],
  ['/disease-detector', Leaf, 'detect'],
  ['/settings/security', Settings, 'settings'],
];

export default function BottomNav() {
  const { t } = useI18n();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 items-stretch border-t border-stone-200 bg-white/95 px-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-1px_2px_rgba(15,23,42,0.04)] backdrop-blur sm:px-2 lg:hidden"
      aria-label="Mobile navigation"
    >
      {items.map(([to, Icon, labelKey]) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex min-h-[3.5rem] min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[10px] font-bold leading-tight transition min-[380px]:text-[11px] sm:px-2 ${
              isActive ? 'bg-leaf-50 text-leaf-800' : 'text-stone-500 hover:bg-stone-50'
            }`
          }
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="max-w-full truncate">{t(labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
