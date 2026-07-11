// 奇袭 (Gan Ning's Surprise Raid) — a black card is 过河拆桥.
// Query skill: any black card can be played as a dismantle.

import type { Skill } from '../skillTypes.js';

export const qixi: Skill = {
  id: 'qixi',
  locked: false,
  queries: {
    cardsAs: (G, owner, cards, as) => {
      if (as !== 'dismantle') return false;
      // Any black card (clubs or spades) counts as 过河拆桥
      return cards.every(card => card.suit === 'clubs' || card.suit === 'spades');
    },
  },
};
