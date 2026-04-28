import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../../context/I18nContext.jsx';

export default function OfflineBanner() {
  const { t } = useI18n();
  const [online, setOnline] = useState(navigator.onLine);

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

  if (online) return null;

  return (
    <div className="fixed inset-x-0 top-16 z-40 flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-100 px-3 py-2 text-center text-sm font-bold text-amber-950 shadow-[0_8px_24px_rgba(120,53,15,0.12)] lg:top-[72px]">
      <WifiOff className="h-4 w-4" />
      {t('offlineMode')}
    </div>
  );
}
