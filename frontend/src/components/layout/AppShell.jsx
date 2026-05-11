import { Outlet } from 'react-router-dom';
import InstallPrompt from '../pwa/InstallPrompt.jsx';
import OfflineBanner from '../pwa/OfflineBanner.jsx';
import BottomNav from './BottomNav.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function AppShell() {
  return (
    <div className="app-shell">
      <OfflineBanner />
      <Topbar />
      <Sidebar />
      <div className="app-content">
        <main className="app-main">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <InstallPrompt />
    </div>
  );
}
