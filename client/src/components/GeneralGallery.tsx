import { useTranslation } from 'react-i18next';
import { generals, localizedName, type Kingdom } from '@3k/shared';

const KINGDOMS: Kingdom[] = ['wei', 'shu', 'wu', 'qun'];

const KINGDOM_COLOR: Record<Kingdom, string> = {
  wei: '#1f6fb2',
  shu: '#2e8b57',
  wu: '#c0392b',
  qun: '#b8860b',
};

export function GeneralGallery() {
  const { t, i18n } = useTranslation();

  return (
    <div>
      {KINGDOMS.map((kingdom) => {
        const roster = generals.filter((general) => general.kingdom === kingdom);
        if (roster.length === 0) return null;

        return (
          <div key={kingdom} style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ color: KINGDOM_COLOR[kingdom], margin: '0 0 0.5rem' }}>
              {t(`kingdom.${kingdom}`)}
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: '0.5rem',
              }}
            >
              {roster.map((general) => (
                <div
                  key={general.id}
                  style={{
                    border: `1px solid ${KINGDOM_COLOR[kingdom]}`,
                    borderRadius: 6,
                    padding: '0.5rem 0.75rem',
                    background: 'white',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{localizedName(general, i18n.language)}</div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>
                    {t('ui.max_hp')}: {general.maxHp}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
