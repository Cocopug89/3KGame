// The moves the board can fire (task 6.2). One method per move in
// server/src/bgio/game.ts's stages — nothing more, and deliberately not a
// boardgame.io `moves` object: the board is handed this interface, so it can be
// driven by the real client, by the dev harness, or by a test, and none of them
// leaks into the components.
//
// Wiring this to a live match (`props.moves` from boardgame.io's React client)
// is Phase 5's job — there is no lobby, no connection and no matchID yet.

import type { CardSlot } from './viewTypes.js';

export interface TableActions {
  /** targets: [] for a card that takes none (桃 heals its player). */
  playCard(cardId: string, targets: string[]): void;
  /** End the action phase. The only move that advances the turn. */
  pass(): void;
  /**
   * Answer a card demand (task 4.1b) — 闪 to a 杀, 桃 to a dying player, 杀 to a
   * 决斗, 无懈可击 to a trick. ONE move for all of them; `respondDodge` and
   * `respondPeach` are gone.
   *
   * No argument = decline. A PARTIAL ANSWER IS NO ANSWER: supply exactly
   * `pending.count` cards (无双 demands two 闪) or supply none.
   */
  supplyCards(cardIds?: string[]): void;
  /** Answer an optional skill's yes/no (§3.4). */
  respondSkill(use: boolean): void;
  /** Exactly `pending.count` cards. */
  discard(cardIds: string[]): void;
  /** Point at one of the target's cards (过河拆桥/顺手牵羊, task 3.3). A SLOT,
   * never a card id — the victim's hand is hidden, and ids leak suit and rank.
   * No decline: the card is already resolving. */
  chooseCard(slot: CardSlot): void;
}

/** What the board fired, for the harness to display and for tests to assert on. */
export interface RecordedIntent {
  move: keyof TableActions;
  args: unknown[];
}

export function recordingActions(sink: (intent: RecordedIntent) => void): TableActions {
  return {
    playCard: (cardId, targets) => sink({ move: 'playCard', args: [cardId, targets] }),
    pass: () => sink({ move: 'pass', args: [] }),
    supplyCards: (cardIds) => sink({ move: 'supplyCards', args: cardIds?.length ? [cardIds] : [] }),
    respondSkill: (use) => sink({ move: 'respondSkill', args: [use] }),
    discard: (cardIds) => sink({ move: 'discard', args: [cardIds] }),
    chooseCard: (slot) => sink({ move: 'chooseCard', args: [slot] }),
  };
}
