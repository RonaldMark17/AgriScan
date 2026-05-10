import { useEffect, useState } from 'react';
import { useI18n } from '../../context/I18nContext.jsx';

export default function TranslatedText({ as: Component = 'span', className = '', text = '', children = null }) {
  const { language, translateText } = useI18n();
  const sourceText = String(text || children || '');
  const [translatedText, setTranslatedText] = useState(sourceText);

  useEffect(() => {
    let active = true;
    setTranslatedText(sourceText);

    if (language === 'en' || !sourceText.trim()) return undefined;

    translateText(sourceText).then((nextText) => {
      if (active) setTranslatedText(nextText || sourceText);
    });

    return () => {
      active = false;
    };
  }, [language, sourceText, translateText]);

  return <Component className={className}>{translatedText}</Component>;
}
