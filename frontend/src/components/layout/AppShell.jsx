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
    <div className="min-h-screen bg-[#fbfbf9]">
      <OfflineBanner />
      <Topbar />
      <div className="flex min-h-[calc(100vh-72px)]">
        <Sidebar />
        <main className="mx-auto w-full max-w-[1540px] flex-1 px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-9 lg:pb-16 lg:pt-9">
          <Outlet />
        </main>
      </div>
      <footer className="fixed bottom-0 left-0 right-0 z-20 hidden h-10 items-center justify-between border-t border-stone-200 bg-white px-8 text-xs text-stone-500 lg:flex">
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
