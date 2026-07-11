// Deck build/shuffle/draw/discard-reshuffle + hand-limit discard. Task 2.2b.
// See docs/engine-design.md §7.

import type { CardId, GState, PlayerId } from './state.js';
import type { RNG } from './rng.js';
import { getCardIndex } from './cardIndex.js';

/** All 107 standard-edition card ids. The bgio setup() (task 2.3) calls this
 * once per match and shuffles the result into G.drawPile at game start. */
export function buildDeck(): CardId[] {
  return [...getCardIndex().keys()];
}

/** Shuffles via the injected RNG — never Math.random(), and the engine never
 * imports boardgame.io directly to get one (§7, §8). */
export function shuffleDeck(deck: readonly CardId[], rng: RNG): CardId[] {
  return rng.shuffle(deck);
}

/**
 * Draws `count` cards for `playerId`, mutating `G` in place, and returns the
 * drawn ids. If the draw pile empties mid-draw, the discard pile is shuffled
 * into it and drawing continues; cards in hands, equipment slots, and
 * judgement zones are in play and are never part of that reshuffle. If both
 * piles are empty, drawing stops early with fewer than `count` cards — a
 * "vanishingly rare" draw-game condition the caller (task 2.3's turn loop) is
 * responsible for detecting and resolving, not something this function
 * should throw on (§7).
 */
export function drawCards(G: GState, playerId: PlayerId, count: number, rng: RNG): CardId[] {
  const player = G.players[playerId];
  if (!player) throw new Error(`drawCards: unknown player ${playerId}`);

  const drawn: CardId[] = [];
  for (let i = 0; i < count; i++) {
    if (G.drawPile.length === 0) {
      if (G.discardPile.length === 0) break; // both piles empty
      G.drawPile = shuffleDeck(G.discardPile, rng);
      G.discardPile = [];
    }
    drawn.push(G.drawPile.shift() as CardId); // index 0 = top, per state.ts
  }
  player.hand.push(...drawn);
  return drawn;
}

/**
 * Takes the single top card of the draw pile without giving it to anyone —
 * the judgement flip (docs/judgement-nullification-design.md §1). Reshuffles
 * the discard pile in if the draw pile is empty, exactly like drawCards().
 *
 * Throws if both piles are empty: a judgement with no card to flip is not a
 * "draw fewer cards" situation, it's a rules dead end. (The draw-game
 * condition proper is Phase 5's — phase-2-review F4.)
 */
export function drawTop(G: GState, rng: RNG): CardId {
  if (G.drawPile.length === 0) {
    if (G.discardPile.length === 0) {
      throw new Error('drawTop: both the draw pile and the discard pile are empty');
    }
    G.drawPile = shuffleDeck(G.discardPile, rng);
    G.discardPile = [];
  }
  return G.drawPile.shift() as CardId;
}

/**
 * Moves specific cards out of a player's hand onto the (public) discard
 * pile. Throws if the player doesn't hold one of the ids — this is the
 * last-line invariant check, not UX; callers (moves, in later tasks) are
 * expected to have already validated the answer server-side.
 */
export function discardFromHand(G: GState, playerId: PlayerId, cardIds: readonly CardId[]): void {
  const player = G.players[playerId];
  if (!player) throw new Error(`discardFromHand: unknown player ${playerId}`);

  for (const id of cardIds) {
    const idx = player.hand.indexOf(id);
    if (idx === -1) {
      throw new Error(`discardFromHand: player ${playerId} does not hold ${id}`);
    }
    player.hand.splice(idx, 1);
    G.discardPile.push(id);
  }
}

/**
 * Hand limit is *current* HP, not max (§7). Returns how many cards over the
 * limit the player currently is (0 if at or under). The discard phase (task
 * 2.3) pushes a `request(discard)` for exactly this many cards when > 0.
 */
export function handLimitOverflow(G: GState, playerId: PlayerId): number {
  const player = G.players[playerId];
  if (!player) throw new Error(`handLimitOverflow: unknown player ${playerId}`);
  return Math.max(0, player.hand.length - player.hp);
}
