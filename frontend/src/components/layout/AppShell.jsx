import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import InstallPrompt from '../pwa/InstallPrompt.jsx';
import OfflineBanner from '../pwa/OfflineBanner.jsx';
import BottomNav from './BottomNav.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function AppShell() {
  const location = useLocation();
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
    <div className={`app-shell relative flex h-[100dvh] min-h-0 w-full min-w-0 flex-col overflow-hidden text-stone-900 lg:flex-row ${online ? '' : 'app-shell-offline'}`}>
      {/* Renders at the top of the flex column on mobile */}
      <Topbar />
      <OfflineBanner online={online} />
      
      {/* Hidden on mobile natively, renders as left column on lg+ screens */}
      <Sidebar />
      
      {/* Fills remaining space; handles its own independent scrolling */}
      <div className="app-content relative z-0 flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain scroll-smooth">
        <main className="app-main min-h-0 flex-1">
          <div key={location.pathname} className="route-transition min-h-0">
            <Outlet />
          </div>
        </main>
      </div>
      
      {/* Renders at the bottom of the flex column on mobile */}
      <BottomNav />
      
      <InstallPrompt />
    </div>
  );
}
