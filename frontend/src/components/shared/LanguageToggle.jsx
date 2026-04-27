import { Languages } from 'lucide-react';
import { useI18n } from '../../context/I18nContext.jsx';

export default function LanguageToggle() {
  const { language, setLanguage } = useI18n();
  return (
    <div className="inline-flex items-center rounded-lg border border-stone-300 bg-white p-1">
      <Languages className="ml-2 h-4 w-4 text-stone-500" />
      <button
        type="button"
        className={`rounded-md px-2 py-1 text-xs font-semibold ${language === 'en' ? 'bg-leaf-700 text-white' : 'text-stone-600'}`}
        onClick={() => setLanguage('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={`rounded-md px-2 py-1 text-xs font-semibold ${language === 'fil' ? 'bg-leaf-700 text-white' : 'text-stone-600'}`}
        onClick={() => setLanguage('fil')}
      >
        FIL
      </button>
    </div>
  );
}
