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
//
// Task 4.4 added a SECOND synchronization point (`ctx.targeted`), between the
// `card.target` fan-out finishing and the demand being built. Two Batch C
// skills need it: 铁骑 (a red judgement makes this strike unanswerable — the
// demand must never even ask) and 流离 (transfers the whole strike, dodge
// demand AND eventual damage, to someone else). Both act as `card.target`
// listeners, which means both run BEFORE this file's original single call
// would have already returned the demand+resume frames — reaching back into
// an already-returned frame to edit it is the retro-edit anti-pattern
// (skill-trigger-design §2.1), so the demand can no longer be built in the
// same call that announces the target. Neither skill can write into ctx
// directly either (this resume frame isn't on top of the stack while their
// judge/request is still running) — they hand their answer back through
// G.turnFlags instead, the same `{t:'flag'}` channel every skill uses to
// write turn state, read here and cleared immediately so a later unrelated
// strike this turn can't see a stale value. A strike neither skill answers
// sees an empty fan-out, this resume pops next, and the observable sequence
// is byte-identical to before 4.4.
//
// The three ctx states are checked MOST-ADVANCED FIRST (`demanded` before
// `targeted` before neither) rather than in narrative order, so that a ctx
// which already carries `demanded: true` — every existing call site that
// resumes after the dodge demand — lands on step 3 regardless of whether
// `targeted` was ever set. That is what keeps this change backward compatible
// with every resume ctx built before 4.4.

import type { CardEffect } from '../effectTypes.js';
import type { CardId, PlayerId } from '../../engine/state.js';
import type { Frame } from '../../engine/frames.js';

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

  resolve: (G, ctx) => {
    const source = ctx.source as PlayerId;
    const targets = ctx.targets as PlayerId[];
    const cards = ctx.cards as CardId[];

    // Step 3 — the demand is answered (or was deemed answered). Checked
    // FIRST: every ctx built before 4.4 only ever sets `demanded`, never
    // `targeted`, and must still land here.
    if (ctx.demanded) {
      const target = targets[0]; // the EFFECTIVE target — 流离 may have rewritten this in step 2
      // `supplied: []` (a deemed 闪 — 八卦阵) and `supplied: ['dodge_2h']` are
      // both answers; `null` is not. Do not collapse them into a truthiness
      // check on the array's length.
      const supplied = (ctx.supplied ?? null) as CardId[] | null;
      if (supplied !== null) {
        // 青龙偃月刀 / 贯石斧 (3.6) listen here — and 贯石斧 can push the damage
        // back on, which is why this branch emits an event instead of
        // returning an empty array and being unreachable forever.
        return [{ t: 'trigger', ev: { event: 'strike.dodged', source, target, card: cards[0] } }];
      }
      return [
        { t: 'trigger', ev: { event: 'strike.hit', source, target, card: cards[0] } },
        { t: 'damage', source, target, amount: 1, kind: 'normal', card: cards[0] },
      ];
    }

    // Step 2 — card.target's whole fan-out (including any judge or request it
    // raised) has fully drained. Read 铁骑/流离's answer, clear it, decide the
    // effective target, then build the demand (or skip it outright).
    if (ctx.targeted) {
      const forceHit = G.turnFlags['tieji.forceHit'] === true;
      const redirectTo = G.turnFlags['liuli.redirectTo'] as PlayerId | undefined;
      const clearFrames: Frame[] = [];
      if (forceHit) clearFrames.push({ t: 'flag', key: 'tieji.forceHit', value: false });
      if (redirectTo !== undefined) clearFrames.push({ t: 'flag', key: 'liuli.redirectTo', value: undefined });
      const target = redirectTo ?? targets[0];

      if (forceHit) {
        // 铁骑: judged red — this strike cannot be dodged. The target is
        // never even asked (no demand is raised at all).
        return [
          ...clearFrames,
          { t: 'trigger', ev: { event: 'strike.hit', source, target, card: cards[0] } },
          { t: 'damage', source, target, amount: 1, kind: 'normal', card: cards[0] },
        ];
      }
      // Drop `targeted` on the way out — it did its job (routing here) and
      // step 3 never reads it; keeping it around would leave a stale field
      // in every demanded ctx, which is exactly the exact-equality trap that
      // bit test/bgio/moves.test.ts once already.
      const { targeted: _targeted, ...restCtx } = ctx;
      return [
        ...clearFrames,
        {
          t: 'demand',
          kind: 'dodge',
          from: target,
          by: source,
          count: 1,
          reasonKey: 'demand.dodge',
          subject: source,
        },
        { t: 'resume', effectKey: 'strike', ctx: { ...restCtx, demanded: true, targets: [target] } },
      ];
    }

    // Step 1 — announce the target. 铁骑/流离/雌雄双股剑 hang off `card.target`,
    // "after targets are locked, before that target responds."
    const target = targets[0];
    return [
      { t: 'trigger', ev: { event: 'card.target', source, target, effectKey: 'strike', cards } },
      { t: 'resume', effectKey: 'strike', ctx: { ...ctx, targeted: true } },
    ];
  },
};
