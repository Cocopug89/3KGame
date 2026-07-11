// 空城 (Zhuge Liang's Empty Fort) — cannot be targeted if no hand.
// Locked query skill: if Zhuge Liang has no hand cards, strikes and duels cannot target him.

import type { Skill } from '../skillTypes.js';

export const kongcheng: Skill = {
  id: 'kongcheng',
  locked: true,
  queries: {
    targetable: (G, owner, source, effectKey) => {
      // Only blocks 杀 (strike) and 决斗 (duel)
      if (effectKey !== 'strike' && effectKey !== 'duel') return true;

      const player = G.players[owner];
      // Cannot be targeted if hand is empty
      return player.hand.length > 0;
    },
  },
};
