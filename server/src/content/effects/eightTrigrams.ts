// 八卦阵 Eight Trigrams: 锁定技 — whenever you need to supply a 闪, judge first;
// red (♥/♦) counts as though you'd played one. skill-trigger-design §12.2
// names this card as the worked example for `demand.open`: "八卦阵 (3.6) is a
// demand.open listener that pushes a {t:'judge', onResult:'eight_trigrams_result'};
// the result effect writes G.demand.supplied = [] — a DEEMED 闪."
//
// `G.demand.supplied` may only change through a frame the pump resolves
// (a CardEffect/SkillTrigger may never mutate G directly, engine-design §3) —
// {t:'demandSupply'} is that channel, the third instance of the
// {t:'setDamage'}/{t:'retrial'} pattern (frames.ts, pump.ts). It is the one
// engine-level addition this task makes; see docs/handoff/3.5-3.6-equipment.md
// for the exact diff, in case it needs re-applying.
//
// A black card (or a chain that leaves G.demand gone by the time the result
// lands) leaves `supplied` at null, so {t:'demandAsk'} falls through to
// asking for a real 闪 — exactly what the card requires when the judgement
// fails.

import type { CardEffect } from '../effectTypes.js';
import type { SkillTrigger } from '../triggerTypes.js';
import type { CardId } from '../../engine/state.js';
import { getCard } from '../../engine/cardIndex.js';

const RED_SUITS = new Set(['hearts', 'diamonds']);

export const eightTrigramsTrigger: SkillTrigger = {
  id: 'equip.eight_trigrams',
  event: 'demand.open',
  optional: false,
  labelKey: 'card.eight_trigrams',
  when: (e, G, owner) =>
    e.event === 'demand.open' && e.kind === 'dodge' && e.from === owner && G.demand?.supplied === null,
  effect: (_e, _G, owner) => [
    { t: 'judge', target: owner, reasonKey: 'judge.eight_trigrams', onResult: 'eight_trigrams_result' },
  ],
};

export const eightTrigramsResult: CardEffect = {
  key: 'eight_trigrams_result',
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,
  resolve: (G, ctx) => {
    const judgeCard = ctx.judgeCard as CardId | undefined;
    if (!judgeCard || !G.demand) return [];
    if (!RED_SUITS.has(getCard(judgeCard).suit)) return [];
    return [{ t: 'demandSupply', cards: [] }];
  },
};
