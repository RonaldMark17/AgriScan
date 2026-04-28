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
    <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white/95 px-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_24px_rgba(15,23,42,0.06)] backdrop-blur sm:px-2 lg:hidden">
      {items.map(([to, Icon, labelKey]) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `min-w-0 flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-bold leading-tight transition min-[380px]:text-[11px] sm:px-2 ${
              isActive ? 'bg-leaf-50 text-leaf-700' : 'text-stone-500 hover:bg-stone-50'
            }`
          }
        >
          <Icon className="h-5 w-5" />
          <span className="max-w-full truncate">{t(labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
