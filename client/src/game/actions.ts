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
  /** 7.2: start an ACTIVE skill (制衡/仁德/结姻/离间/反间/青囊/苦肉) during your
   * own action phase. `cardIds` are the COST (may be empty — 反间/苦肉),
   * `targets` per the skill's own TargetSpec. Server validates everything. */
  useSkill(skillId: string, cardIds: string[], targets: string[]): void;
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

  // ── Batch B / C (tasks 4.3, 4.4) ────────────────────────────────────────
  // One move per stage in the shared stage/move map, and the names are THAT
  // map's (@3k/shared's THREE_KINGDOMS_STAGE_MOVES) — boardgame.io dispatches a
  // move by name into a stage by name, so a typo here looks exactly like a
  // server that ignored you.

  /** 刚烈 (discard two / take the damage) · 洛神 (judge again / stop) — one of the
   * labelled options the ENGINE offered. No decline: the option list is the
   * answer space, and one of them must be chosen. */
  chooseOption(optionId: string): void;
  /** 突袭 — a seat, not a card. `null` declines, which is a real answer here:
   * 突袭 takes from *up to* two players, so stopping early is the skill working,
   * not the player refusing. */
  choosePlayer(playerId: string | null): void;
  /** 反间 — the target names a suit before 周瑜 reveals the card. Blind by
   * design: the whole skill is the guess. */
  declareSuit(suit: string): void;
  /** 观星 — the offered cards, re-ordered, all of them. Index 0 ends up on top of
   * the draw pile. */
  arrangeCards(order: string[]): void;
  /** 鬼才 — one of your OWN hand cards, to replace the judgement card with.
   * `null` declines (the optional trigger already said yes; changing your mind
   * here is free — see bgio/game.ts's submitRetrial). */
  submitRetrial(cardId: string | null): void;
  /** 遗计 — every drawn card assigned to a living seat, including your own. */
  distributeCards(assignments: { cardId: string; target: string }[]): void;
  /** 流离 — discard one of your cards to move the 杀 onto `newTarget`. Both
   * arguments are required: the discard is the COST, not a formality. */
  redirectStrike(cardId: string, newTarget: string): void;
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
    useSkill: (skillId, cardIds, targets) =>
      sink({ move: 'useSkill', args: [skillId, cardIds, targets] }),
    supplyCards: (cardIds) => sink({ move: 'supplyCards', args: cardIds?.length ? [cardIds] : [] }),
    respondSkill: (use) => sink({ move: 'respondSkill', args: [use] }),
    discard: (cardIds) => sink({ move: 'discard', args: [cardIds] }),
    chooseCard: (slot) => sink({ move: 'chooseCard', args: [slot] }),
    chooseOption: (optionId) => sink({ move: 'chooseOption', args: [optionId] }),
    choosePlayer: (playerId) => sink({ move: 'choosePlayer', args: [playerId] }),
    declareSuit: (suit) => sink({ move: 'declareSuit', args: [suit] }),
    arrangeCards: (order) => sink({ move: 'arrangeCards', args: [order] }),
    submitRetrial: (cardId) => sink({ move: 'submitRetrial', args: [cardId] }),
    distributeCards: (assignments) => sink({ move: 'distributeCards', args: [assignments] }),
    redirectStrike: (cardId, newTarget) =>
      sink({ move: 'redirectStrike', args: [cardId, newTarget] }),
  };
}
