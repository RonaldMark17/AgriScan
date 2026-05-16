import { WifiOff } from 'lucide-react';
import { useI18n } from '../../context/I18nContext.jsx';

export default function OfflineBanner({ online }) {
  const { t } = useI18n();

  if (online) return null;

  return (
    <div className="offline-banner">
      <WifiOff className="h-4 w-4" />
      {t('offlineMode')}
    </div>
  );
}
