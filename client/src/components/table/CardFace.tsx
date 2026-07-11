import { useTranslation } from 'react-i18next';
import { localizedName } from '@3k/shared';
import { cardById, isRedSuit, SUIT_SYMBOL } from '../../game/cardIndex';

export type CardSize = 'sm' | 'md';

interface CardFaceProps {
  cardId: string;
  size?: CardSize;
  selected?: boolean;
  onClick?: (cardId: string) => void;
  /** Extra line under the name, e.g. an equipment slot label. */
  subtitle?: string;
  /** Why this card can't answer the current prompt (already translated). The
   * card still renders — greyed, unclickable, and able to explain itself, which
   * beats a card that silently does nothing when clicked. */
  blockedReason?: string | null;
}

/**
 * A single card, face up. Purely presentational — selection and click handling
 * are owned by the parent (targeting/legality is task 6.2, and is the server's
 * call anyway).
 */
export function CardFace({
  cardId,
  size = 'md',
  selected,
  onClick,
  subtitle,
  blockedReason = null,
}: CardFaceProps) {
  const { i18n } = useTranslation();
  const card = cardById(cardId);

  if (!card) return <div className={`card card--${size} card--unknown`}>?</div>;

  const red = isRedSuit(card.suit);
  const blocked = blockedReason != null;
  const interactive = onClick != null && !blocked;

  return (
    <button
      type="button"
      className={[
        'card',
        `card--${size}`,
        `card--${card.type}`,
        selected ? 'card--selected' : '',
        interactive ? 'card--interactive' : '',
        blocked ? 'card--blocked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={!interactive}
      title={blockedReason ?? undefined}
      onClick={interactive && onClick ? () => onClick(cardId) : undefined}
    >
      <span className={`card__corner ${red ? 'card__corner--red' : ''}`}>
        {card.rank}
        {SUIT_SYMBOL[card.suit] ?? ''}
      </span>
      <span className="card__name">{localizedName(card, i18n.language)}</span>
      {subtitle ? <span className="card__subtitle">{subtitle}</span> : null}
    </button>
  );
}

/** A card we're not allowed to see — another player's hand, or the draw pile. */
export function CardBack({ size = 'sm' }: { size?: CardSize }) {
  return <div className={`card card--${size} card--back`} aria-hidden="true" />;
}

/** An equipment slot with nothing in it. Rendered (rather than omitted) so a
 * seat's equipment row keeps a stable shape as cards come and go. */
export function EmptySlot({ label, size = 'sm' }: { label: string; size?: CardSize }) {
  return (
    <div className={`card card--${size} card--empty`}>
      <span className="card__subtitle">{label}</span>
    </div>
  );
}
