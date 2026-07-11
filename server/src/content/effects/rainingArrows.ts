// 万箭齐发 Raining Arrows (plan §3.2/3.4). Same shape as barbarianInvasion.ts,
// except each other player owes a 闪 instead of a 杀. See that file's header
// for the `nullify: 'per_target'` reasoning and the AoE target-count
// simplification (docs/handoff/3.4-complex-tricks.md).

import type { CardEffect } from '../effectTypes.js';
import type { CardId, PlayerId } from '../../engine/state.js';

export const rainingArrows: CardEffect = {
  key: 'raining_arrows',

  targeting: {
    min: 1,
    max: 'all_others',
    self: 'forbidden',
  },

  nullify: 'per_target',

  canPlay: () => true,

  resolve: (_G, ctx) => {
    const source = ctx.source as PlayerId;
    const target = (ctx.targets as PlayerId[])[0];

    if (!ctx.asked) {
      const cards = ctx.cards as CardId[];
      return [
        { t: 'log', key: 'log.plays_at', params: { player: source, card: cards[0], target } },
        {
          t: 'demand',
          kind: 'dodge',
          from: target,
          by: source,
          count: 1,
          reasonKey: 'demand.dodge_arrows',
          subject: source,
        },
        { t: 'resume', effectKey: 'raining_arrows', ctx: { ...ctx, asked: true } },
      ];
    }

    const supplied = (ctx.supplied ?? null) as CardId[] | null;
    if (supplied === null) {
      return [
        { t: 'damage', source, target, amount: 1, kind: 'normal' },
        { t: 'log', key: 'log.damage', params: { target, n: 1, source } },
      ];
    }
    return [{ t: 'log', key: 'log.responds', params: { player: target, card: supplied[0] } }];
  },
};
