// 诸葛连弩 Zhuge Crossbow (range 1): no limit on 杀 played per turn. Pure query
// — there is no event to hang a listener on, it's a straight answer to "how
// many 杀 may this player play this turn?" (engine/queries.ts's strikeLimit
// fold), exactly the worked example engine-design §3 and skill-trigger-design
// §4 both cite ("咆哮 · 诸葛连弩 (3.6)"). 锁定技: always on while equipped, so it
// is a plain Infinity, not a trigger + flag.

import type { QueryHandlers } from '../queryTypes.js';

export const zhugeCrossbowQuery: Partial<QueryHandlers> = {
  strikeLimit: () => Infinity,
};
