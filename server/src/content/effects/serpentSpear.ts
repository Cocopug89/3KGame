// 丈八蛇矛 Serpent Spear (range 3): you may use TWO hand cards together as one
// 杀. Pure 视为 permission — queries.cardsAs (skill-trigger-design §4) takes an
// array specifically so this card can answer it; bgio/game.ts's playCard
// already accepts `cardIds` as an array and validates the claim through this
// fold ("`cardIds` is an ARRAY because 丈八蛇矛 (3.6) turns TWO hand cards into
// one 杀"). No range/suit/rank restriction on which two cards — any two.

import type { QueryHandlers } from '../queryTypes.js';

export const serpentSpearQuery: Partial<QueryHandlers> = {
  cardsAs: (_G, _owner, cards, as) => as === 'strike' && cards.length === 2,
};
