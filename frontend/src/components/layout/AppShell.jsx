import { Outlet } from 'react-router-dom';
import InstallPrompt from '../pwa/InstallPrompt.jsx';
import OfflineBanner from '../pwa/OfflineBanner.jsx';
import BottomNav from './BottomNav.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function AppShell() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#f4f6f3] pt-16 text-stone-950 lg:pt-[72px]">
      <OfflineBanner />
      <Topbar />
      <Sidebar />
      <div className="min-h-[calc(100dvh-64px)] lg:min-h-[calc(100dvh-72px)] lg:pl-64">
        <main className="mx-auto w-full min-w-0 max-w-[1440px] px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pt-5 lg:px-6 lg:pb-14 lg:pt-7 xl:px-8">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <InstallPrompt />
    </div>
  );
}
