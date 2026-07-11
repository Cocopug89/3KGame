// 龙胆 (Zhao Yun's Dragon Heart) — a 杀 is a 闪 and a 闪 is a 杀.
// Query skill: Zhao Yun can treat strikes as dodges and dodges as strikes.

import type { Skill } from '../skillTypes.js';

export const longdan: Skill = {
  id: 'longdan',
  locked: false,
  queries: {
    cardsAs: (G, owner, cards, as) => {
      if (as === 'strike') {
        // 闪 counts as 杀
        return cards.every(card => card.effectKey === 'dodge');
      }
      if (as === 'dodge') {
        // 杀 counts as 闪
        return cards.every(card => card.effectKey === 'strike');
      }
      return false;
    },
  },
};
