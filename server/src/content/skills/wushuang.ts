// 无双 (Lü Bu's Peerless) — locked query. Your 杀 demands TWO 闪; a 决斗 you are
// duelling in demands TWO 杀 per round from your opponent.
//
// `demandCount(G, owner, kind, current)` is called with `owner` = whoever
// RAISED the demand (queries.ts's own doc comment) — so this handler only
// ever fires when Lü Bu himself is the one demanding, via
// providersOf(G, lüBu). No engine change: skill-trigger-design §5 built this
// fold specifically so 无双 could be pure content.

import type { Skill } from '../skillTypes.js';

export const wushuang: Skill = {
  id: 'wushuang',
  locked: true,
  queries: {
    demandCount: (_G, _owner, kind, current) => (kind === 'dodge' || kind === 'strike' ? 2 : current),
  },
};
