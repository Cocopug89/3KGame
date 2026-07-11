import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cards, localizedName, type CardType } from '@3k/shared';

const CARD_TYPES: CardType[] = ['basic', 'trick', 'equipment'];

export function CardGallery() {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<CardType | 'all'>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? cards : cards.filter((card) => card.type === filter)),
    [filter],
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {(['all', ...CARD_TYPES] as const).map((value) => {
          const active = filter === value;
          const label = value === 'all' ? t('ui.all') : t(`card_type.${value}`);
          return (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              style={{
                marginTop: 0,
                background: active ? '#007bff' : '#e0e0e0',
                color: active ? 'white' : '#333',
              }}
            >
              {label}
            </button>
          );
        })}
        <span style={{ alignSelf: 'center', color: '#666', marginLeft: '0.5rem' }}>
          {filtered.length} / {cards.length}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '0.5rem',
        }}
      >
        {filtered.map((card) => (
          <div
            key={card.id}
            style={{
              border: '1px solid #ddd',
              borderRadius: 6,
              padding: '0.5rem 0.75rem',
              background: 'white',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#888' }}>{card.position}</div>
            <div style={{ fontWeight: 600 }}>{localizedName(card, i18n.language)}</div>
            <div style={{ fontSize: '0.75rem', color: '#666' }}>
              {t(`card_type.${card.type}`)}
              {card.equipmentType ? ` · ${t(`equipment_type.${card.equipmentType}`)}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
