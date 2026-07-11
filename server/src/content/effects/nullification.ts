// 无懈可击 Nullification. Like 闪, this card is never played through the
// action-phase `playCard` move — it is only ever *supplied* in answer to a
// `{t:'demand', kind:'nullification'}` raised by a nullify window
// (docs/judgement-nullification-design.md §2). The `supplyCards` move
// validates it, discards it, and writes the answer into the window's resume
// ctx; the window's own resolve() does the rest.
//
// The registry entry still exists — every card name needs one (2.2a's
// effectKey contract) — so this is a documented no-op, not a missing case,
// exactly like dodge.ts.

import type { CardEffect } from '../effectTypes.js';

export const nullification: CardEffect = {
  key: 'nullification',

  targeting: {
    min: 0,
    max: 0,
    self: 'only',
  },

  // Nullification is not "playable" in the action phase at all. It has no
  // turn-based rule gating it the way strikeLimit gates 杀; whether it may be
  // supplied right now is entirely a question of whether a window is open,
  // which the demand protocol answers.
  nullify: 'none', // a 无懈可击 answering a window is itself nullifiable — but that
  // is the window re-opening with parity flipped (§2.3), not a wrap around a
  // {t:'play'} frame. It never gets played through 'play'.
  canPlay: () => false,

  resolve: () => [],
};
