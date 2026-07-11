// Task 5.2 — the general-selection screen. The Lord picks first, in the open;
// everyone else then picks at the same time, knowing who they may have to face
// (or protect). That's the whole reason the window is Lord-first, so the screen
// leads with it.
//
// It shows you your own candidates and nothing else — not because the component
// filters anything, but because playerView never sent it (server/src/bgio/game.ts).
// Other players appear only as "still choosing" / "locked in".

import { useTranslation } from 'react-i18next';
import { generals, localizedName } from '@3k/shared';
import type { SelectionView } from '../game/viewTypes';

function generalOf(id: string) {
  return generals.find((g) => g.id === id);
}

interface GeneralSelectProps {
  selection: SelectionView;
  viewerId: string | null;
  /** null while the move is in flight or when you've already picked. */
  onPick: (generalId: string) => void;
}

export function GeneralSelect({ selection, viewerId, onPick }: GeneralSelectProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;

  const isLord = viewerId === selection.lord;
  const myTurn = viewerId !== null && selection.awaiting.includes(viewerId);
  const lordGeneral = selection.lordGeneralId ? generalOf(selection.lordGeneralId) : null;

  return (
    <section>
      <h2 style={{ fontSize: '1.15rem' }}>{t('select.title')}</h2>

      <p style={{ color: '#555' }}>
        {lordGeneral
          ? t('select.lord_revealed', {
              player: `#${selection.lord}`,
              general: localizedName(lordGeneral, language),
            })
          : t('select.lord_picking', { player: `#${selection.lord}` })}
      </p>

      {myTurn ? (
        <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
          {selection.candidates.map((id) => {
            const general = generalOf(id);
            if (!general) return null;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onPick(id)}
                  style={{
                    display: 'block',
                    textAlign: 'left',
                    padding: '0.6rem 0.8rem',
                    minWidth: '9rem',
                    cursor: 'pointer',
                  }}
                >
                  <strong style={{ display: 'block' }}>{localizedName(general, language)}</strong>
                  <span style={{ color: '#666', fontSize: '0.85rem' }}>
                    {t(`kingdom.${general.kingdom}`)} ·{' '}
                    {t('select.max_hp', {
                      // `n`, never `count` — `count` puts i18next into plural
                      // resolution (key_one/key_other), and per-language plural
                      // variants would break the zh/en key-parity test.
                      n: general.maxHp + (isLord ? 1 : 0),
                    })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>
          {selection.myPick
            ? t('select.you_picked', {
                general: localizedName(generalOf(selection.myPick)!, language),
              })
            : t('ui.waiting')}
        </p>
      )}

      <p style={{ color: '#666' }}>
        {selection.awaiting.length > 0
          ? t('select.still_choosing', { n: selection.awaiting.length })
          : t('select.dealing')}
      </p>
    </section>
  );
}
