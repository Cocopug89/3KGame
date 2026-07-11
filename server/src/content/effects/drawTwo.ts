// 无中生有 Draw Two (plan §3.2): draw two cards. The whole card.
//
// It is worth one file anyway, because it is the smallest possible proof that
// the 无懈可击 wrap is generic: nothing here mentions nullification, and yet
// this card can be nullified — pump.ts's 'play' case reads `nullify ?? (trick
// ⇒ 'once')` and wraps the effect frame before it ever gets here. If a
// 无懈可击 lands, the {t:'draw'} below is simply never pushed.

import type { CardEffect } from '../effectTypes.js';
import type { PlayerId } from '../../engine/state.js';

export const drawTwo: CardEffect = {
  key: 'draw_two',

  targeting: {
    min: 0,
    max: 0,
    self: 'only',
  },

  canPlay: () => true,

  resolve: (_G, ctx) => [{ t: 'draw', player: ctx.source as PlayerId, count: 2 }],
};
