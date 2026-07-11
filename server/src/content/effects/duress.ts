// 借刀杀人 Duress (plan §3.2/3.4 — the plan doc's card name is sometimes
// glossed "Duress" and sometimes lumped in with the AoEs; content/standard/
// cards.json is the source of truth and its `effectKey` for 借刀杀人 is
// `duress`, so that's what this file registers under).
//
// Source names TWO targets at play time: `targets[0]` (must have a weapon
// equipped) and `targets[1]` (who `targets[0]` will be asked to strike).
// `targets[0]` then chooses: play a 杀 against `targets[1]` (a REAL strike —
// dodge/damage and all — not just "satisfy a demand"), or hand their
// equipped weapon to the source.
//
// ⚠️ Known simplification (docs/handoff/3.4-complex-tricks.md): the real card
// requires `targets[1]` to be within `targets[0]`'s attack range — a PAIRWISE
// constraint TargetSpec.predicate can't express (it only ever sees one
// candidate against `self`, never the other selected target). Rather than
// extend the shared TargetSpec/validateTargets shape for one card, this is
// re-checked here at resolve() time instead of at target-selection time: an
// out-of-range or weapon-less pairing simply fizzles (same "state changed
// between play and resolve" shrug every other trick in this batch uses).
// "Once per action phase" (出牌阶段限一次) is NOT enforced — a second, smaller,
// documented gap; low value relative to the risk of a hand-rolled turnFlags
// limit for one card this session didn't have room to also test thoroughly.

import type { CardEffect } from '../effectTypes.js';
import type { CardId, PlayerId } from '../../engine/state.js';
import { inAttackRange } from '../../engine/distance.js';

export const duress: CardEffect = {
  key: 'duress',

  targeting: {
    min: 2,
    max: 2,
    self: 'allowed',
  },

  canPlay: () => true,

  resolve: (G, ctx) => {
    const source = ctx.source as PlayerId;
    const [target1, target2] = ctx.targets as PlayerId[];

    if (!ctx.asked) {
      const holder = G.players[target1];
      if (!holder?.alive || !holder.equipment.weapon) return []; // re-check: no longer holds a weapon
      if (!inAttackRange(G, target1, target2)) return []; // re-check: the pairwise range constraint

      const playedCards = ctx.cards as CardId[];
      return [
        { t: 'log', key: 'log.plays_at', params: { player: source, card: playedCards[0], target: target1 } },
        {
          t: 'demand',
          kind: 'strike',
          from: target1,
          by: source,
          count: 1,
          reasonKey: 'demand.strike_duress',
          subject: target2,
        },
        { t: 'resume', effectKey: 'duress', ctx: { ...ctx, asked: true } },
      ];
    }

    const supplied = (ctx.supplied ?? null) as CardId[] | null;
    if (supplied !== null && supplied.length > 0) {
      // They attacked target2 for real — dodge/damage and all, exactly like
      // any other 杀 (strike.ts). The card was already discarded by the
      // demand's supplyCards move; replaying it as a {t:'play'} doesn't need
      // it back in target1's hand.
      return [
        { t: 'log', key: 'log.responds', params: { player: target1, card: supplied[0] } },
        { t: 'play', source: target1, cards: supplied, targets: [target2], effectKey: 'strike' },
      ];
    }

    // Refused, or couldn't answer — the weapon changes hands.
    const weapon = G.players[target1]?.equipment.weapon;
    if (!weapon) return [];
    const cards: CardId[] = [weapon];
    return [
      {
        t: 'moveCards',
        cards,
        from: { z: 'equip', player: target1 },
        to: { z: 'hand', player: source },
        by: source,
      },
      { t: 'log', key: 'log.card_taken', params: { player: source, target: target1, card: weapon } },
    ];
  },
};
