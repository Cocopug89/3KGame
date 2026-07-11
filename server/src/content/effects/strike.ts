// 杀 Strike (plan §3.1, engine-design §2's worked example). The canonical
// multi-step effect: ask the target for 闪, then either nothing happens or
// damage lands. This is the shape every future "attack that can be dodged"
// effect follows.
//
// Task 4.1b rewrote the asking. It used to push a bespoke `respondDodge`
// request; it now raises a `{t:'demand', kind:'dodge'}` (skill-trigger-design
// §5), which is the same round-trip plus three things this effect must not know
// about: 龙胆/倾国 answering with a card that is not a 闪 (queries.cardsAs),
// 无双 demanding two of them (queries.demandCount), and 八卦阵/护驾 supplying one
// without the target lifting a finger (the demand.open fan-out). All of that
// happens inside the demand; resolve() just reads `supplied` on the way back.

import type { CardEffect } from '../effectTypes.js';
import type { CardId, PlayerId } from '../../engine/state.js';

export const strike: CardEffect = {
  key: 'strike',

  targeting: {
    min: 1,
    max: 1,
    self: 'forbidden',
    inRange: 'attack',
  },

  // strikesPlayed/strikeLimit incrementing is generic move bookkeeping
  // (server/src/bgio/game.ts's playCard), not part of resolve() — canPlay
  // just reads the limit that bookkeeping maintains. The limit itself is
  // folded per turn by queries.strikeLimit (咆哮 ⇒ Infinity), so 张飞 needs no
  // code in this file — which is exactly the test of whether §4 is right.
  canPlay: (G) => G.turnFlags.strikesPlayed < G.turnFlags.strikeLimit,

  resolve: (_G, ctx) => {
    const source = ctx.source as PlayerId;
    const targets = ctx.targets as PlayerId[];
    const cards = ctx.cards as CardId[];
    const target = targets[0];

    if (!ctx.demanded) {
      // Narrative order: the target is announced (铁骑/流离/雌雄双股剑 hang off
      // `card.target`, "after targets are locked, before that target responds"),
      // then asked, then we come back here with the answer. The demand pushes
      // the request; this resume frame is what sits underneath it and what
      // {t:'demandClose'} patches with `supplied`.
      return [
        {
          t: 'trigger',
          ev: { event: 'card.target', source, target, effectKey: 'strike', cards },
        },
        {
          t: 'demand',
          kind: 'dodge',
          from: target,
          by: source,
          count: 1,
          reasonKey: 'demand.dodge',
          subject: source,
        },
        { t: 'resume', effectKey: 'strike', ctx: { ...ctx, demanded: true } },
      ];
    }

    // `supplied: []` (a deemed 闪 — 八卦阵) and `supplied: ['dodge_2h']` are both
    // answers; `null` is not. Do not collapse them into a truthiness check on
    // the array's length.
    const supplied = (ctx.supplied ?? null) as CardId[] | null;
    if (supplied !== null) {
      // 青龙偃月刀 / 贯石斧 (3.6) listen here — and 贯石斧 can push the damage
      // back on, which is why this branch emits an event instead of returning
      // an empty array and being unreachable forever.
      return [{ t: 'trigger', ev: { event: 'strike.dodged', source, target, card: cards[0] } }];
    }

    return [
      { t: 'trigger', ev: { event: 'strike.hit', source, target, card: cards[0] } },
      { t: 'damage', source, target, amount: 1, kind: 'normal', card: cards[0] },
    ];
  },
};
