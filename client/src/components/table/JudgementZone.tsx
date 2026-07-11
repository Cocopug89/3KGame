import { useTranslation } from 'react-i18next';
import type { AnyPlayerView } from '../../game/viewTypes';
import { CardFace } from './CardFace';

/**
 * Delayed tricks parked in front of a seat (乐不思蜀 / 闪电). Resolution is LIFO
 * — the most recently placed card judges FIRST (engine-design §4) — so the
 * stack is drawn top-of-stack first, left to right.
 *
 * Nothing puts cards here until Phase 3; the zone exists in the state shape now,
 * so the layout accounts for it now rather than being retrofitted around it.
 */
export function JudgementZone({ player }: { player: AnyPlayerView }) {
  const { t } = useTranslation();
  if (player.judgementZone.length === 0) return null;

  const topFirst = [...player.judgementZone].reverse();

  return (
    <div className="judge" title={t('ui.judgement_zone')}>
      <span className="judge__label">{t('ui.judgement_zone')}</span>
      <div className="judge__cards">
        {topFirst.map((cardId) => (
          <CardFace key={cardId} cardId={cardId} size="sm" />
        ))}
      </div>
    </div>
  );
}
