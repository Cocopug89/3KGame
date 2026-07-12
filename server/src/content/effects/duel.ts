// 决斗 Duel (plan §3.2/3.4). Source targets one other living player, no range
// limit (no `inRange` on the TargetSpec). Then the two alternate: starting
// with the TARGET, whoever currently owes a response must play a 杀 or take
// 1 damage from the other and the card ends there — there is no cumulative
// damage, exactly one hit ends the exchange.
//
// `nullify` is left unset — the trick default ('once') wraps the WHOLE
// exchange in one window at play time, which is correct here (unlike the
// delayed tricks in indulgence.ts/lightning.ts): 决斗 takes effect the moment
// it resolves, there is no later "judge phase" timing trap to dodge (3.1 §3).
//
// F1 note (CONTINUE.md fact 1): a losing 决斗 can backfire onto the turn
// player (they played it, lost the exchange, and take the damage) — this is
// exactly the wedge F1 was fixed for, and per CONTINUE.md is now safe.

import type { CardEffect } from '../effectTypes.js';
import type { CardId, PlayerId } from '../../engine/state.js';
import type { Frame } from '../../engine/frames.js';

interface DuelCtx {
  source: PlayerId;
  targets: PlayerId[];
  cards: CardId[];
  asked?: boolean;
  /** Whoever currently owes a 杀. */
  current?: PlayerId;
  /** Their exchange partner — who deals the 1 damage if `current` fails. */
  other?: PlayerId;
  supplied?: CardId[] | null;
}

export const duel: CardEffect = {
  key: 'duel',

  targeting: {
    min: 1,
    max: 1,
    self: 'forbidden',
  },

  canPlay: () => true,

  resolve: (_G, rawCtx) => {
    const ctx = rawCtx as unknown as DuelCtx;

    if (!ctx.asked) {
      // First exchange: the TARGET responds first (标准: 目标角色先出杀).
      const target = ctx.targets[0];
      const source = ctx.source;
      return [
        { t: 'log', key: 'log.plays_at', params: { player: source, card: ctx.cards[0], target } },
        {
          t: 'demand',
          kind: 'strike',
          from: target,
          by: source,
          count: 1,
          reasonKey: 'demand.strike_duel',
          subject: source,
        },
        {
          t: 'resume',
          effectKey: 'duel',
          ctx: { ...ctx, asked: true, current: target, other: source } as unknown as Record<
            string,
            unknown
          >,
        },
      ];
    }

    const current = ctx.current as PlayerId;
    const other = ctx.other as PlayerId;
    const supplied = (ctx.supplied ?? null) as CardId[] | null;

    if (supplied === null) {
      // `current` failed to (or could not) produce a 杀 — the exchange ends
      // right here, one hit, no more rounds.
      return [
        // `card` names the ORIGINAL 决斗 card, not whichever 杀 was last
        // exchanged — task 4.3's 裸衣 needs to tell "this damage came from a
        // 杀 or 决斗" apart from card-less AoE damage (南蛮入侵/万箭齐发), and
        // ctx.cards[0] is the one thing that's stable across the whole
        // exchange. Safe to add: `card` was already optional on {t:'damage'},
        // and nothing here previously read it back off this frame.
        { t: 'damage', source: other, target: current, amount: 1, kind: 'normal', card: ctx.cards[0] },
        { t: 'log', key: 'log.damage', params: { target: current, n: 1, source: other } },
      ];
    }

    // `current` supplied a 杀 — the exchange flips: NOW `other` owes one.
    const frames: Frame[] = [
      { t: 'log', key: 'log.responds', params: { player: current, card: supplied[0] } },
      {
        t: 'demand',
        kind: 'strike',
        from: other,
        by: current,
        count: 1,
        reasonKey: 'demand.strike_duel',
        subject: current,
      },
      {
        t: 'resume',
        effectKey: 'duel',
        ctx: {
          source: ctx.source,
          targets: ctx.targets,
          cards: ctx.cards,
          asked: true,
          current: other,
          other: current,
        } as unknown as Record<string, unknown>,
      },
    ];
    return frames;
  },
};
