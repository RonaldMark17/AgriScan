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
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-3 py-2 text-sm font-semibold text-amber-950">
      <WifiOff className="h-4 w-4" />
      {t('offlineMode')}
    </div>
  );
}
