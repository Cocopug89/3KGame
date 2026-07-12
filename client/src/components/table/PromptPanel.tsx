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
import { CardFace } from './CardFace';

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
  // ── Batch B/C answer pickers (4.3, 4.4). Optional so the read-only board and
  // the 6.1 fixtures can still render a panel without wiring seven callbacks;
  // a prompt whose picker is missing renders its controls disabled rather than
  // pretending to accept a click.
  onPickOption?: (optionId: string) => void;
  onPickPlayer?: (playerId: string) => void;
  onPickSuit?: (suit: string) => void;
  onToggleOrder?: (cardId: string) => void;
  onAssign?: (cardId: string, target: string) => void;
}

/**
 * What the engine is asking you, and the ways out of it.
 *
 * The panel exists because `G.pending` is the only thing that ever blocks the
 * game, and a player who can't tell *what* they're being asked will stall the
 * table — especially for the requests that arrive on someone else's turn (a 闪
 * you owe, a 桃 someone else needs, a 刚烈 judgement that has just gone against
 * you). It states the question, shows how much of the answer is still
 * outstanding, and offers the decline path explicitly rather than leaving "do
 * nothing" as an invisible option.
 *
 * 弃牌 has no secondary button on purpose: declining isn't a legal answer, and
 * the engine will not move on until the cards are chosen. Neither do 刚烈/洛神
 * (one of the options IS the answer space), 反间 (the guess is the skill), 观星
 * or 遗计 — for all of them the optional trigger's yes/no *was* the decline, and
 * it has already been given.
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
  onPickOption,
  onPickPlayer,
  onPickSuit,
  onToggleOrder,
  onAssign,
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

  // The engine ships its own explanation on the request ('choose.dismantle',
  // 'choose.ganglie'), and where it has one it makes a better question than any
  // generic title this file could write — "Not a Heart — the damage source must
  // choose" beats "Choose an option". Guarded with i18n.exists() because a skill
  // can reach the UI before its string does, and a raw key is not a question.
  const reasonTitleKey =
    prompt.reasonKey && i18n.exists(prompt.reasonKey) ? prompt.reasonKey : prompt.titleKey;

  const title =
    demandKind(state) === 'peach' && subjectId && subjectId !== viewerId
      ? t('prompt.respond_peach_for', { player: nameOf(subjectId) })
      : t(reasonTitleKey, {
          player: prompt.choiceTarget ? nameOf(prompt.choiceTarget) : '',
        });

  // WHY the card is being demanded ('judge.lightning', 'nullify.indulgence'…).
  // Guarded: a reasonKey with no locale entry renders nothing rather than the
  // raw key (several are still missing, and a new card adds a new one).
  const reasonKey = demandReasonKey(state);
  const reason = reasonKey && i18n.exists(reasonKey) ? t(reasonKey) : null;

  const order = selection.order ?? [];
  const assignments = selection.assignments ?? [];
  const offered = prompt.cards ?? [];

  /** Seats a 遗计 card may be sent to: every living character, 郭嘉 included. */
  const livingSeats = state.seats.filter((id) => state.players[id]?.alive);

  /** What is still missing, in one line. `ready` is the same predicate the
   * primary button is gated on, so the hint can never say "ready" while the
   * button is dead (or the reverse). */
  const hint = (): string => {
    if (ready) return t('prompt.ready');
    switch (prompt.kind) {
      case 'chooseCard':
        return t('prompt.select_one_card');
      case 'chooseOption':
        return t('prompt.select_option');
      case 'declareSuit':
        return t('prompt.select_suit');
      case 'choosePlayer':
        return t('prompt.select_player');
      case 'guanxing':
        return t('prompt.order_cards', { n: offered.length - order.length });
      case 'yijiDistribute':
        return t('prompt.assign_cards', { n: offered.length - assignments.length });
      // 流离 wants a card AND a seat: name whichever is still outstanding rather
      // than a generic "incomplete", or the player stares at a dead button.
      case 'liuliRedirect':
        return selection.cards.length < 1
          ? t('prompt.select_cards', { n: 1 })
          : t('prompt.select_player');
      default:
        return selection.cards.length < prompt.cardCount
          ? t('prompt.select_cards', { n: prompt.cardCount - selection.cards.length })
          : range && selection.targets.length < range.min
            ? t('prompt.select_targets', { n: range.min - selection.targets.length })
            : t('prompt.ready');
    }
  };

  return (
    <div className={`prompt ${rejected ? 'prompt--rejected' : ''}`}>
      <div className="prompt__title">{title}</div>
      {reason ? <div className="prompt__reason">{reason}</div> : null}

      {/* 刚烈 · 洛神 — the engine's own labelled options, and nothing else. */}
      {prompt.kind === 'chooseOption' && prompt.options ? (
        <div className="prompt__options">
          {prompt.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`btn btn--option ${selection.option === option.id ? 'btn--picked' : ''}`}
              disabled={!onPickOption}
              onClick={onPickOption ? () => onPickOption(option.id) : undefined}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      ) : null}

      {/* 反间 — a blind suit guess. */}
      {prompt.kind === 'declareSuit' && prompt.suits ? (
        <div className="prompt__options">
          {prompt.suits.map((suit) => (
            <button
              key={suit}
              type="button"
              className={`btn btn--option ${selection.suit === suit ? 'btn--picked' : ''}`}
              disabled={!onPickSuit}
              onClick={onPickSuit ? () => onPickSuit(suit) : undefined}
            >
              {t(`suit.${suit}`)}
            </button>
          ))}
        </div>
      ) : null}

      {/* 突袭 · 流离 — seats the ENGINE offered. Never re-derived here: it has
          already range-checked them (see prompts.ts's `candidates`). */}
      {(prompt.kind === 'choosePlayer' || prompt.kind === 'liuliRedirect') && prompt.candidates ? (
        <div className="prompt__options">
          {prompt.candidates.map((id) => (
            <button
              key={id}
              type="button"
              className={`btn btn--option ${selection.player === id ? 'btn--picked' : ''}`}
              disabled={!onPickPlayer}
              onClick={onPickPlayer ? () => onPickPlayer(id) : undefined}
            >
              {nameOf(id)}
            </button>
          ))}
        </div>
      ) : null}

      {/* 观星 — click the cards in the order they go back on the pile. The badge
          is the position, which is the whole answer: 1 ends up on top. */}
      {prompt.kind === 'guanxing' ? (
        <div className="prompt__cards">
          {offered.map((cardId) => {
            const at = order.indexOf(cardId);
            return (
              <div key={cardId} className="prompt__card">
                <CardFace
                  cardId={cardId}
                  size="sm"
                  selected={at >= 0}
                  onClick={onToggleOrder}
                  subtitle={at >= 0 ? t('prompt.order_position', { n: at + 1 }) : undefined}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      {/* 遗计 — each drawn card, and the seats it can go to. Every card must be
          placed; 郭嘉 keeping one is a placement, not a skip. */}
      {prompt.kind === 'yijiDistribute' ? (
        <div className="prompt__cards prompt__cards--column">
          {offered.map((cardId) => {
            const to = assignments.find((a) => a.cardId === cardId)?.target ?? null;
            return (
              <div key={cardId} className="prompt__assign">
                <CardFace cardId={cardId} size="sm" selected={to != null} />
                <div className="prompt__options">
                  {livingSeats.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`btn btn--option ${to === id ? 'btn--picked' : ''}`}
                      disabled={!onAssign}
                      onClick={onAssign ? () => onAssign(cardId, id) : undefined}
                    >
                      {id === viewerId ? t('ui.you') : nameOf(id)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="prompt__hint">{hint()}</div>

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
