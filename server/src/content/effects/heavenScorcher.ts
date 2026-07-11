// 方天画戟 Heaven-Scorcher Halberd (range 4): when the 杀 you are about to play
// is your LAST hand card, it may target up to 2 additional players (3 total).
// Pure targetLimit query (skill-trigger-design §4's own worked example,
// "方天画戟 (3.6) — max targets for `effectKey`").
//
// "Last hand card" is read directly off G.players[owner].hand: bgio/game.ts's
// playCard calls validateTargets() BEFORE discardFromHand() removes the
// card being played, so hand.length === 1 at that moment means the 杀 under
// consideration IS the only card left — exactly the card text's condition.

import type { QueryHandlers } from '../queryTypes.js';

export const heavenScorcherQuery: Partial<QueryHandlers> = {
  targetLimit: (G, owner, effectKey, current) => {
    if (effectKey !== 'strike') return current;
    const hand = G.players[owner]?.hand ?? [];
    return hand.length === 1 ? current + 2 : current;
  },
};
