// The internal continuation 遗计 (yiji.ts) hops into once its {t:'draw'} has
// actually landed two cards in the owner's hand. Not a card, never played
// directly (canPlay: false) — dispatched the same way nullifyWindow/
// dyingWindow are, via a plain effectRegistry entry.
//
// The two drawn ids aren't visible anywhere in this effect's ctx (a
// SkillTrigger's effect() only runs once and can't "come back later" itself,
// which is exactly why yiji.ts hops into an effectKey instead of trying to
// return the request directly) — so this reads them straight back off
// G.players[owner].hand: drawCards (engine/deck.ts) always PUSHES onto the
// end of hand, and nothing else can have touched this hand between the draw
// landing and this effect running (fully synchronous, no other player's move
// can interleave), so `hand.slice(-2)` is exactly and only the two cards
// {t:'draw'} just gave.
//
// The actual moves — one moveCards per assignment — are applied directly by
// the `yijiDistribute`/`distributeCards` bgio move (server/src/bgio/game.ts),
// not through a second resume hop here: there is nothing left for this
// effect to do once the request is answered.

import type { CardEffect } from '../effectTypes.js';
import type { PlayerId } from '../../engine/state.js';

export const yijiDistribute: CardEffect = {
  key: 'yiji_distribute',

  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,

  resolve: (G, rawCtx) => {
    const owner = (rawCtx as { owner: PlayerId }).owner;
    const hand = G.players[owner]?.hand ?? [];
    // Fewer than 2 if the draw pile (and discard pile) ran dry — vanishingly
    // rare, same tolerance deck.ts's own drawCards already has.
    const drawn = hand.slice(-2);
    if (drawn.length === 0) return [];

    return [
      {
        t: 'request',
        req: { kind: 'yijiDistribute', playerId: owner, cards: drawn, reasonKey: 'skill.yiji' },
      },
    ];
  },
};
