// 桃园结义 Peach Garden (plan §3.2/3.4). Every player, INCLUDING the source,
// recovers 1 HP — the one AoE that targets `self: 'allowed'` with `max: 'all'`
// rather than `all_others`. Unconditional per target (no demand — nothing to
// dodge or resist), so `nullify: 'per_target'` per judgement-nullification-
// design §2.2's table only ever has ONE thing to cancel per window: the heal.
//
// See barbarianInvasion.ts's header for the shared AoE target-count
// simplification this card inherits too.

import type { CardEffect } from '../effectTypes.js';
import type { CardId, PlayerId } from '../../engine/state.js';

export const peachGarden: CardEffect = {
  key: 'peach_garden',

  targeting: {
    min: 1,
    max: 'all',
    self: 'allowed',
  },

  nullify: 'per_target',

  canPlay: () => true,

  resolve: (_G, ctx) => {
    const source = ctx.source as PlayerId;
    const cards = ctx.cards as CardId[];
    const target = (ctx.targets as PlayerId[])[0];
    return [
      { t: 'log', key: 'log.plays_at', params: { player: source, card: cards[0], target } },
      { t: 'heal', target, amount: 1 },
      { t: 'log', key: 'log.heal', params: { target, n: 1 } },
    ];
  },
};
