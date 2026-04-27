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
    <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white px-2 py-2 shadow-[0_-10px_24px_rgba(15,23,42,0.06)] lg:hidden">
      {items.map(([to, Icon, labelKey]) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
              isActive ? 'text-leaf-700' : 'text-stone-500'
            }`
          }
        >
          <Icon className="h-5 w-5" />
          <span>{t(labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
