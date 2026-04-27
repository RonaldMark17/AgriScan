import { Download, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../../context/I18nContext.jsx';

const INSTALL_DISMISSED_KEY = 'agriscan_install_prompt_dismissed';

export default function InstallPrompt() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(() => localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true');

  useEffect(() => {
    const beforeInstall = (event) => {
      event.preventDefault();
      if (localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true') return;
      setPrompt(event);
    };
    const update = () => setUpdateReady(true);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('agriscan:update-ready', update);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('agriscan:update-ready', update);
    };
  }, []);

  function dismiss() {
    if (updateReady) {
      setUpdateReady(false);
      return;
    }
    localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
    setInstallDismissed(true);
    setPrompt(null);
  }

  if ((!prompt || installDismissed) && !updateReady) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3 shadow-soft">
      <p className="text-sm font-semibold text-stone-800">{updateReady ? t('newVersionReady') : t('installPrompt')}</p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          className="btn-primary"
          type="button"
          onClick={async () => {
            if (updateReady) {
              window.location.reload();
              return;
            }
            await prompt.prompt();
            setPrompt(null);
          }}
        >
          {updateReady ? <RefreshCw className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          {updateReady ? t('update') : t('install')}
        </button>
        <button className="btn-icon h-9 w-9" type="button" onClick={dismiss} aria-label={t('dismissInstallPrompt')}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
