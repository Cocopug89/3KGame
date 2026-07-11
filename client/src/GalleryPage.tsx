import { useTranslation } from 'react-i18next';
import { LanguageToggle } from './components/LanguageToggle';
import { CardGallery } from './components/CardGallery';
import { GeneralGallery } from './components/GeneralGallery';

// Phase 1.5: static gallery to eyeball cards.json/generals.json against the
// locale files and prove the i18n toggle works before the engine (Phase 2)
// or any interactive board (Phase 6) exists.
export function GalleryPage() {
  const { t } = useTranslation();

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 1100, margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <h1 style={{ margin: 0 }}>三国杀 · Three Kingdoms Kill</h1>
        <LanguageToggle />
      </header>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2>{t('ui.card_gallery')}</h2>
        <CardGallery />
      </section>

      <section>
        <h2>{t('ui.general_gallery')}</h2>
        <GeneralGallery />
      </section>
    </div>
  );
}
