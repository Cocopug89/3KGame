// The 濒死 window's continuation — task 4.1b.
//
// The window itself is a rule, and it stays in the engine (pump.ts's 'dying'
// case + engine/dying.ts's asker ordering: start with the dying player, proceed
// clockwise through the living, stop at the first save or after everyone has
// been asked once). What lands HERE is only the part that reads a player's
// answer, because the answer now comes back through the generic card-demand
// protocol (skill-trigger-design §5) rather than a bespoke `respondPeach` stage
// — and a demand hands its answer to a `{t:'resume'}` frame, which is dispatched
// through the effect registry.
//
// That indirection is what buys 华佗's 急救 ("在你的回合外，你可以将你的红色手牌
// 当【桃】使用"): the *demand* asks whether the asker can produce a 桃, folding
// queries.cardsAs over their hand, so a red card counts without this file, the
// dying window, or 桃 itself knowing anything about 华佗.

import type { CardEffect } from '../effectTypes.js';
import type { CardId, PlayerId } from '../../engine/state.js';

export const dyingWindow: CardEffect = {
  key: 'dying_window',

  // Never played, never targeted — an internal continuation, like nullify_window.
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,

  resolve: (_G, ctx) => {
    const target = ctx.target as PlayerId;
    const asker = ctx.asker as PlayerId;
    const offset = ctx.offset as number;
    const killer = (ctx.killer ?? null) as PlayerId | null;
    const supplied = (ctx.supplied ?? null) as CardId[] | null;

    if (supplied === null) {
      // Declined, or could not answer at all (demandAsk never even asked).
      // Move the window on to the next player in line.
      return [{ t: 'dying', target, asker: target, offset: offset + 1, killer, notified: true }];
    }

    // Saved — heal, then re-check the SAME offset rather than trusting the
    // window to be over: in Standard every hit is exactly 1 damage so one 桃
    // always closes it, but a 2-point hit needs a second 桃 from the same
    // player, and the re-entered {t:'dying'} frame's own hp check is what
    // decides. (The heal is a frame, not a mutation — engine-design §3.)
    return [
      {
        t: 'heal',
        target,
        amount: 1,
        source: asker,
        ...(supplied.length > 0 ? { card: supplied[0] } : {}),
      },
      { t: 'dying', target, asker, offset, killer, notified: true },
    ];
  },
};
