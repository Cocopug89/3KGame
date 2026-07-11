// U1 (CONTINUE.md's "Finding U1"): the `act` request carries `legalTargets`,
// a precomputed map the UI can grey out-of-range seats from without learning
// a single rule. Read-only, cheap (one pass over the player's own hand, ~4-8
// candidates each) — recomputed fresh every time an `act` request is built
// (phases.ts's action-phase entry, and the two re-queued requests in
// bgio/game.ts's playCard/useSkill), never cached.
//
// ⚠️ `isLegalTarget` below is a DELIBERATE, DOCUMENTED DUPLICATE of the
// per-candidate loop inside bgio/game.ts's `validateTargets` — it was not
// factored into one shared function because `validateTargets` is exercised by
// every card in the game and is not this task's to risk destabilising two
// files before a full regression run. If the two ever drift, this is the
// symptom: a seat the picker offers gets an INVALID_MOVE back, or a seat the
// picker greys out was actually legal. `validateTargets`'s per-candidate
// checks are the source of truth; keep this in sync with it by hand.
//
// This module must not import boardgame.io — see docs/engine-design.md §8.

import type { CardId, GState, PlayerId } from './state.js';
import { getCard } from './cardIndex.js';
import { distance, inAttackRange } from './distance.js';
import { ignoresDistance, targetable } from './queries.js';
import { effectRegistry } from '../content/effectRegistry.js';
import type { TargetSpec } from '../content/effectTypes.js';

function isLegalTarget(
  G: GState,
  self: PlayerId,
  spec: TargetSpec,
  effectKey: string,
  candidate: PlayerId,
): boolean {
  const player = G.players[candidate];
  if (!player?.alive) return false;
  if (candidate === self) {
    if (spec.self === 'forbidden') return false;
  } else if (spec.self === 'only') {
    return false;
  }
  if (candidate !== self && !targetable(G, candidate, self, effectKey)) return false;
  if (!ignoresDistance(G, self, effectKey)) {
    if (spec.inRange === 'attack' && !inAttackRange(G, self, candidate)) return false;
    if (spec.inRange === 'distance_1' && distance(G, self, candidate) > 1) return false;
  }
  if (spec.predicate && !spec.predicate(G, self, candidate)) return false;
  return true;
}

/**
 * Every seat `self` could legally NAME if they played `cardId` — ignoring
 * only the min/max *count* (a picker greys seats before it knows how many the
 * player intends to click; `targetLimit`'s cardinality fold has nothing to
 * bite on yet). A card with no targets at all (`max: 0` — 无中生有, 闪电,
 * 五谷丰登) returns `[]`, which is also correct: there is nothing to grey.
 */
export function legalTargetsForCard(G: GState, self: PlayerId, cardId: CardId): PlayerId[] {
  // Defensive, not just tidy: plenty of engine/bgio unit tests build a hand
  // out of throwaway ids ('a', 'b'...) that were never meant to survive a
  // getCard() lookup, because those tests predate U1 and have nothing to do
  // with targeting. A bad id here must degrade to "nothing to grey", not take
  // the whole `act` request down with it.
  try {
    const card = getCard(cardId);
    const effect = effectRegistry[card.effectKey];
    if (!effect || effect.targeting.max === 0) return [];
    return G.seats.filter(
      (id) => G.players[id]?.alive && isLegalTarget(G, self, effect.targeting, card.effectKey, id),
    );
  } catch {
    return [];
  }
}

/**
 * Computed once per `act` request: one entry per DISTINCT card id currently
 * in `playerId`'s hand. Keyed by id rather than effectKey so the client can
 * look a clicked card straight up without knowing that two copies of the same
 * card behave identically.
 */
export function legalTargetsForHand(G: GState, playerId: PlayerId): Record<CardId, PlayerId[]> {
  const hand = G.players[playerId]?.hand ?? [];
  const out: Record<CardId, PlayerId[]> = {};
  for (const cardId of hand) {
    if (!(cardId in out)) out[cardId] = legalTargetsForCard(G, playerId, cardId);
  }
  return out;
}
