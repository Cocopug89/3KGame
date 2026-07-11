// The 无懈可击 chain — docs/judgement-nullification-design.md §2.
//
// THE MODEL: parity, not recursion. A chain is N cards deep, each cancelling
// the one before; resolution is LIFO and the outcome depends only on the
// parity of N (odd ⇒ cancelled, even ⇒ it happens). So rather than nesting a
// fresh window inside every "yes", ONE window re-opens itself with the parity
// flipped and the ask-circle restarted from the top — because everyone now
// gets a chance to counter the 无懈可击 that was just played. Mathematically
// identical to nesting; no new frame type; no stack of half-finished windows.
//
// It is an ordinary CardEffect dispatched through the ordinary registry, and
// the answer comes back through the ordinary resume frame — the mechanism
// 2.4/2.6 established and 3.1 §2.1 chose deliberately over engine-design §5's
// literal "push the request and re-push the window underneath it" wording,
// which is the exact stale-frame bug task 2.6 had to back out of. (See
// engine/dying.ts's header comment.)
//
// TERMINATION is free: every "yes" permanently removes a 无懈可击 from a hand
// (the supplyCards move discards it), and there are only 3 in the deck.

import type { CardEffect } from '../effectTypes.js';
import type { Frame } from '../../engine/frames.js';
import { nullifyAskerAtOffset } from '../../engine/nullify.js';

export interface NullifyWindowCtx {
  /** The frame this window guards. Pushed iff the chain lands EVEN. */
  protect: Frame;
  /** Pushed instead iff the chain lands ODD. Usually absent — "cancelled"
   * normally means "nothing happens". 闪电 is the exception: a nullified 闪电
   * is NOT discarded, it travels on to the next player (§2.4). */
  onNullified?: Frame;
  parity: 0 | 1;
  offset: number;
  reasonKey: string;
  /** Set once the window has asked someone; on the way back, `supplied` holds
   * the answer (the supplyCards move writes it into this same ctx). */
  asked?: boolean;
  supplied?: string[] | null;
}

export const nullifyWindow: CardEffect = {
  key: 'nullify_window',

  // Never played, never targeted — this is an internal effect the engine
  // pushes around card plays (pump.ts's 'play' case) and around a delayed
  // trick's judgement (phases.ts). It exists in the registry because that is
  // how every multi-step effect is dispatched.
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,

  resolve: (G, rawCtx) => {
    const ctx = rawCtx as unknown as NullifyWindowCtx;

    // Fold in the answer to the question we asked last time round, if any.
    let parity = ctx.parity;
    let offset = ctx.offset;
    if (ctx.asked) {
      if (ctx.supplied && ctx.supplied.length > 0) {
        parity = (parity ^ 1) as 0 | 1; // one more 无懈可击 in the chain
        offset = 0; // …and everyone may now counter THAT one
      } else {
        offset += 1; // declined (or couldn't answer) — ask the next one
      }
    }

    const asker = nullifyAskerAtOffset(G, offset);
    if (asker === null) {
      // The circle is exhausted: nobody else can nullify. Count the chain.
      if (parity === 0) return [ctx.protect];
      return ctx.onNullified ? [ctx.onNullified] : [];
    }

    // Narrative order: ask, then come back here with the answer. The demand
    // frame pushes the request; this resume frame is what sits underneath it
    // and what supplyCards() patches (engine/pump.ts's applyToResumeFrame).
    const next: NullifyWindowCtx = {
      protect: ctx.protect,
      onNullified: ctx.onNullified,
      parity,
      offset,
      reasonKey: ctx.reasonKey,
      asked: true,
      // `supplied` deliberately NOT carried over — a stale answer from the
      // previous round would flip the parity twice.
    };
    return [
      {
        t: 'demand',
        kind: 'nullification',
        from: asker,
        // Nobody in particular is demanding — a nullification window is the
        // table's question, not a player's, so there is no owner for 无双's
        // demandCount to fold over.
        by: null,
        count: 1,
        reasonKey: ctx.reasonKey,
      },
      { t: 'resume', effectKey: 'nullify_window', ctx: next as unknown as Record<string, unknown> },
    ];
  },
};

/** Wrap `protect` in a nullification window. The one place that builds the
 * initial ctx, so pump.ts, phases.ts and (later) 3.4's 五谷丰登 can't drift on
 * the starting parity/offset. */
export function nullifyWindowFrame(
  protect: Frame,
  reasonKey: string,
  onNullified?: Frame,
): Frame {
  const ctx: NullifyWindowCtx = { protect, onNullified, parity: 0, offset: 0, reasonKey };
  return { t: 'effect', effectKey: 'nullify_window', ctx: ctx as unknown as Record<string, unknown> };
}
