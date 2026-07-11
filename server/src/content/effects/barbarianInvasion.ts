// 南蛮入侵 Barbarian Invasion (plan §3.2/3.4). Hits every OTHER living player:
// each must play a 杀 or take 1 damage from the source (no distance limit).
//
// `nullify: 'per_target'` (judgement-nullification-design §2.2): pump.ts's
// 'play' case already wraps EACH target in its OWN independent 无懈可击
// window and calls this resolve() once per target with `ctx.targets` holding
// exactly that one player — so this file only ever has to think about one
// target at a time, same shape as a single-target card.
//
// ⚠️ Known simplification (see docs/handoff/3.4-complex-tricks.md): the
// TargetSpec's `min`/`max` can't express "must be exactly every other living
// player" (min is a plain number, and the player count is dynamic 4-8) — so
// the server currently accepts whatever subset of other players the client
// sends. A future client always offering the full set is what makes this an
// AoE in practice; nothing stops a hand-crafted move from under-targeting.

import type { CardEffect } from '../effectTypes.js';
import type { CardId, PlayerId } from '../../engine/state.js';

export const barbarianInvasion: CardEffect = {
  key: 'barbarian_invasion',

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
          kind: 'strike',
          from: target,
          by: source,
          count: 1,
          reasonKey: 'demand.strike_barbarian',
          subject: source,
        },
        { t: 'resume', effectKey: 'barbarian_invasion', ctx: { ...ctx, asked: true } },
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
