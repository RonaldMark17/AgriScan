import { Languages } from 'lucide-react';
import { useI18n } from '../../context/I18nContext.jsx';

export default function LanguageToggle() {
  const { language, setLanguage } = useI18n();
  return (
    <div className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white p-1 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
      <Languages className="ml-2 h-4 w-4 shrink-0 text-stone-500" />
      <button
        type="button"
        className={`focus-ring min-w-10 rounded-md px-2 py-1.5 text-xs font-bold transition ${language === 'en' ? 'bg-leaf-700 text-white' : 'text-stone-600 hover:bg-stone-50'}`}
        onClick={() => setLanguage('en')}
        aria-pressed={language === 'en'}
      >
        EN
      </button>
      <button
        type="button"
        className={`focus-ring min-w-10 rounded-md px-2 py-1.5 text-xs font-bold transition ${language === 'fil' ? 'bg-leaf-700 text-white' : 'text-stone-600 hover:bg-stone-50'}`}
        onClick={() => setLanguage('fil')}
        aria-pressed={language === 'fil'}
      >
        FIL
      </button>
    </div>
  );
}
