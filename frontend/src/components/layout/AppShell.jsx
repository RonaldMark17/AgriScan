import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import InstallPrompt from '../pwa/InstallPrompt.jsx';
import OfflineBanner from '../pwa/OfflineBanner.jsx';
import BottomNav from './BottomNav.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function AppShell() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className={`app-shell relative flex h-[100dvh] w-full flex-col overflow-hidden bg-stone-50 text-stone-900 md:flex-row ${online ? '' : 'app-shell-offline'}`}>
      {/* Renders at the top of the flex column on mobile */}
      <Topbar />
      <OfflineBanner online={online} />
      
      {/* Hidden on mobile natively, renders as left column on md+ screens */}
      <Sidebar />
      
      {/* Fills remaining space; handles its own independent scrolling */}
      <div className="app-content relative z-0 flex h-full w-full flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth">
        <main className="app-main mx-auto w-full max-w-7xl flex-1 p-4 pb-24 sm:p-6 md:pb-8 lg:p-8">
          <Outlet />
        </main>
      </div>
      
      {/* Renders at the bottom of the flex column on mobile */}
      <BottomNav />
      
      <InstallPrompt />
    </div>
  );
}
