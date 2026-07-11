// Who gets asked for a 无懈可击, and in what order —
// docs/judgement-nullification-design.md §2.1. Pure helpers, same shape as
// distance.ts and dying.ts; the parity logic itself lives in the
// `nullify_window` effect (content/effects/nullifyWindow.ts), because it is
// content-shaped, not engine-shaped.
//
// This module must not import boardgame.io — see docs/engine-design.md §8.

import type { GState, PlayerId } from './state.js';
import { getCard } from './cardIndex.js';

/**
 * Whether `playerId` can answer a nullification demand at all. Phase 3: holds
 * a 无懈可击. Phase 4 widens this — a skill that produces one from elsewhere
 * (视为 a 无懈可击) makes its owner an asker — which is exactly why this is a
 * named function and not an inline `.some()`.
 */
export function canRespondNullify(G: GState, playerId: PlayerId): boolean {
  const player = G.players[playerId];
  if (!player?.alive) return false;
  return player.hand.some((cardId) => getCard(cardId).effectKey === 'nullification');
}

/**
 * The `offset`-th player who *can* respond, walking living seats clockwise
 * from the current turn player (标准: 由当前回合角色开始, 按座位顺序). Returns
 * null once the circle is exhausted — the window's signal that the chain has
 * closed.
 *
 * Non-holders are skipped rather than asked-and-declined: the server knows
 * every hand, so an un-answerable prompt is a wasted round-trip, not fairness.
 * Same call dying.ts makes when it skips an asker holding no 桃.
 */
export function nullifyAskerAtOffset(G: GState, offset: number): PlayerId | null {
  const n = G.seats.length;
  let seen = -1;
  for (let step = 0; step < n; step++) {
    const playerId = G.seats[(G.activeSeat + step) % n];
    if (!canRespondNullify(G, playerId)) continue;
    seen += 1;
    if (seen === offset) return playerId;
  }
  return null;
}
