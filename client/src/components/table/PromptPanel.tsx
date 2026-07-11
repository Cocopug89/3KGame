import { useTranslation } from 'react-i18next';
import { localizedName } from '@3k/shared';
import { generalById } from '../../game/cardIndex';
import { canSubmit } from '../../game/interaction';
import type { Selection } from '../../game/interaction';
import {
  demandKind,
  demandReasonKey,
  demandSubject,
  targetRange,
  type PromptView,
} from '../../game/prompts';
import type { TableState } from '../../game/viewTypes';

interface PromptPanelProps {
  state: TableState;
  viewerId: string;
  prompt: PromptView;
  selection: Selection;
  livingOthers: number;
  onSubmit: () => void;
  onSecondary: () => void;
  /** Set when the server rejected the last move (INVALID_MOVE). */
  rejected: boolean;
}

/**
 * What the engine is asking you, and the two ways out of it.
 *
 * The panel exists because `G.pending` is the only thing that ever blocks the
 * game, and a player who can't tell *what* they're being asked will stall the
 * table — especially for the two requests that arrive on someone else's turn
 * (a 闪 you owe, a 桃 someone else needs). It states the question, shows how
 * many cards/targets are still outstanding, and offers the decline path
 * explicitly rather than leaving "do nothing" as an invisible option.
 *
 * 弃牌 has no secondary button on purpose: declining isn't a legal answer, and
 * the engine will not move on until the cards are chosen.
 */
export function PromptPanel({
  state,
  viewerId,
  prompt,
  selection,
  livingOthers,
  onSubmit,
  onSecondary,
  rejected,
}: PromptPanelProps) {
  const { t, i18n } = useTranslation();

  const nameOf = (id: string): string => {
    const player = state.players[id];
    const general = player ? generalById(player.generalId) : undefined;
    return general ? localizedName(general, i18n.language) : id;
  };

  const ready = canSubmit(prompt, selection, livingOthers);
  const card = selection.cards[0];
  const range = prompt.needsTargets && card ? targetRange(card, livingOthers) : null;

  // A demand can be addressed to someone other than the player it is *about* —
  // a 桃 for a dying stranger, in seat order — so say who, or the player being
  // asked to spend their own card can't tell why.
  const subjectId = demandSubject(state);

  // chooseCard's question names the victim ("Dismantle — choose a card of Lü
  // Bu's"), and the engine ships the key on the request (`choose.dismantle`).
  // Same i18n.exists() guard as a demand's reasonKey: a card can reach the UI
  // before its string does, and a raw key is not a question.
  const chooseTitleKey =
    prompt.kind === 'chooseCard' && prompt.reasonKey && i18n.exists(prompt.reasonKey)
      ? prompt.reasonKey
      : prompt.titleKey;

  const title =
    demandKind(state) === 'peach' && subjectId && subjectId !== viewerId
      ? t('prompt.respond_peach_for', { player: nameOf(subjectId) })
      : t(chooseTitleKey, {
          player: prompt.choiceTarget ? nameOf(prompt.choiceTarget) : '',
        });

  // WHY the card is being demanded ('judge.lightning', 'nullify.indulgence'…).
  // Guarded: a reasonKey with no locale entry renders nothing rather than the
  // raw key (several are still missing, and a new card adds a new one).
  const reasonKey = demandReasonKey(state);
  const reason = reasonKey && i18n.exists(reasonKey) ? t(reasonKey) : null;

  return (
    <div className={`prompt ${rejected ? 'prompt--rejected' : ''}`}>
      <div className="prompt__title">{title}</div>
      {reason ? <div className="prompt__reason">{reason}</div> : null}

      <div className="prompt__hint">
        {prompt.kind === 'chooseCard'
          ? selection.slot
            ? t('prompt.ready')
            : t('prompt.select_one_card')
          : selection.cards.length < prompt.cardCount
            ? t('prompt.select_cards', { n: prompt.cardCount - selection.cards.length })
            : range && selection.targets.length < range.min
              ? t('prompt.select_targets', { n: range.min - selection.targets.length })
              : t('prompt.ready')}
      </div>

      {rejected ? <div className="prompt__error">{t('prompt.rejected')}</div> : null}

      <div className="prompt__buttons">
        <button type="button" className="btn btn--primary" disabled={!ready} onClick={onSubmit}>
          {t(prompt.primaryKey)}
        </button>
        {prompt.secondary ? (
          <button type="button" className="btn btn--secondary" onClick={onSecondary}>
            {t(prompt.secondaryKey ?? 'ui.cancel')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
