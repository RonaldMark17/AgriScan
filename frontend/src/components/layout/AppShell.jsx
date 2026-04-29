import { Link, Outlet } from 'react-router-dom';
import InstallPrompt from '../pwa/InstallPrompt.jsx';
import OfflineBanner from '../pwa/OfflineBanner.jsx';
import BottomNav from './BottomNav.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import { useI18n } from '../../context/I18nContext.jsx';

export default function AppShell() {
  const { t } = useI18n();
  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#f7faf6] pt-16 text-stone-950 lg:pt-[72px]">
      <OfflineBanner />
      <Topbar />
      <Sidebar />
      <div className="min-h-[calc(100dvh-64px)] lg:min-h-[calc(100dvh-72px)] lg:pl-64">
        <main className="mx-auto w-full min-w-0 max-w-[1500px] px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pt-5 lg:px-7 lg:pb-16 lg:pt-8 xl:px-9">
          <Outlet />
        </main>
      </div>
      <footer className="fixed bottom-0 right-0 z-20 hidden h-10 items-center justify-between border-t border-stone-200 bg-white/95 px-7 text-xs text-stone-500 backdrop-blur lg:left-64 lg:flex xl:px-9">
        <div className="flex items-center gap-6">
          <Link to="/scan" className="inline-flex items-center gap-2 transition hover:text-stone-900">
            <span className="h-2.5 w-2.5 rounded-full bg-leaf-500" /> {t('manualScanReady')}
          </Link>
          <Link to="/settings/security" className="inline-flex items-center gap-2 transition hover:text-stone-900">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> {t('offlineSyncReady')}
          </Link>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/reports" className="transition hover:text-stone-900">AgriScan v1.2.0</Link>
          <Link to="/settings/security" className="font-semibold text-leaf-700 transition hover:text-leaf-900">
            {t('helpCenter')}
          </Link>
        </div>
      </footer>
      <BottomNav />
      <InstallPrompt />
    </div>
  );
}
