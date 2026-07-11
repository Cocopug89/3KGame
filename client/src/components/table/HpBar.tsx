import { useTranslation } from 'react-i18next';

interface HpBarProps {
  hp: number;
  maxHp: number;
  dying: boolean;
  dead: boolean;
}

/**
 * HP as pips rather than a number — max HP is 3–5 in Standard edition, so the
 * whole range is legible at a glance, and "how close is that seat to dying" is
 * the single most-read number on the table.
 *
 * A dying player (hp ≤ 0 with the window still open) shows zero filled pips and
 * the 濒死 badge; hp can't go below 0 visually even if the engine dipped lower.
 */
export function HpBar({ hp, maxHp, dying, dead }: HpBarProps) {
  const { t } = useTranslation();
  const filled = Math.max(0, Math.min(hp, maxHp));
  const low = filled === 1;

  return (
    <div className="hp" title={`${hp} / ${maxHp}`}>
      <div className="hp__pips">
        {Array.from({ length: maxHp }, (_, i) => (
          <span
            key={i}
            className={[
              'hp__pip',
              i < filled ? 'hp__pip--filled' : 'hp__pip--empty',
              i < filled && low ? 'hp__pip--low' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        ))}
      </div>
      <span className="hp__count">
        {filled}/{maxHp}
      </span>
      {dying && !dead ? <span className="badge badge--dying">{t('ui.dying')}</span> : null}
      {dead ? <span className="badge badge--dead">{t('ui.dead')}</span> : null}
    </div>
  );
}
