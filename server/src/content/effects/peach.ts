// 桃 Peach, non-dying use only (plan §3.1): heal 1 HP, playable any time
// you're hurt. Saving a dying player at any time (task 2.6) is a different
// invocation path (through the dying-window request), not this resolve().

import type { CardEffect } from '../effectTypes.js';
import type { CardId, PlayerId } from '../../engine/state.js';

export const peach: CardEffect = {
  key: 'peach',

  targeting: {
    min: 0,
    max: 0,
    self: 'only',
  },

  canPlay: (G, self) => G.players[self].hp < G.players[self].maxHp,

  resolve: (_G, ctx) => {
    const source = ctx.source as PlayerId;
    const cards = ctx.cards as CardId[];
    // `source` is threaded onto the heal so `heal.after` can name who did it —
    // 救援 (the lord skill) is the listener, and it needs to know (4.1 §2).
    return [{ t: 'heal', target: source, amount: 1, source, card: cards[0] }];
  },
};
