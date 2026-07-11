import { useTranslation } from 'react-i18next';
import { CARD_BLOCK_I18N_KEY, cardBlock, type PromptView } from '../../game/prompts';
import type { SelfPlayerView, TableState } from '../../game/viewTypes';
import { CardBack, CardFace } from './CardFace';

interface HandZoneProps {
  state: TableState;
  /** Null for a spectator, or before the viewer has been seated. */
  player: SelfPlayerView | null;
  /** Null when the engine isn't waiting on this viewer — the hand is then
   * inert, which is correct: there is no move to make. */
  prompt: PromptView | null;
  selectedCards: readonly string[];
  onToggleCard: (cardId: string) => void;
  /** Backs to draw when we can't see the hand (spectator view). */
  hiddenCount?: number;
}

/**
 * The viewer's hand. Which cards are *selectable* depends entirely on the
 * prompt: a 闪 response only accepts 闪, a 弃牌 accepts anything, and during
 * your action phase a 杀 you've already used up your limit on is greyed with a
 * reason (see prompts.ts `cardBlock`). Everything greyed still *renders* —
 * hiding cards would hide information the player already legitimately has.
 *
 * None of this is authority: the server re-validates the move and can still say
 * no (range, most of all — the client doesn't compute it). That rejection
 * surfaces in the PromptPanel rather than here.
 */
export function HandZone({
  state,
  player,
  prompt,
  selectedCards,
  onToggleCard,
  hiddenCount = 0,
}: HandZoneProps) {
  const { t } = useTranslation();

  const cards = player?.hand ?? [];
  const count = player ? cards.length : hiddenCount;

  return (
    <div className="hand">
      <div className="hand__label">
        {t('ui.hand')} · {t('ui.cards_count', { n: count })}
      </div>
      <div className="hand__cards">
        {player
          ? cards.map((cardId) => {
              const block = prompt ? cardBlock(state, player, prompt, cardId) : 'wrong_card';
              const reason = prompt == null ? null : block ? t(CARD_BLOCK_I18N_KEY[block]) : null;
              return (
                <CardFace
                  key={cardId}
                  cardId={cardId}
                  size="md"
                  selected={selectedCards.includes(cardId)}
                  blockedReason={prompt == null ? t('ui.waiting') : reason}
                  onClick={onToggleCard}
                />
              );
            })
          : Array.from({ length: hiddenCount }, (_, i) => <CardBack key={i} size="md" />)}
        {count === 0 ? <span className="hand__empty">—</span> : null}
      </div>
    </div>
  );
}
