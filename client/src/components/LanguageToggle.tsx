import { useTranslation } from 'react-i18next';
import type { Language } from '../i18n';

const LANGUAGES: Array<{ code: Language; label: string }> = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'EN' },
];

export function LanguageToggle() {
  const { i18n } = useTranslation();

  return (
    <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
      {LANGUAGES.map(({ code, label }) => {
        const active = i18n.language === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => void i18n.changeLanguage(code)}
            aria-pressed={active}
            style={{
              marginTop: 0,
              background: active ? '#007bff' : '#e0e0e0',
              color: active ? 'white' : '#333',
              fontWeight: active ? 700 : 400,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
