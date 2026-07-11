// 倾国 (Zhen Ji's Peerless Beauty) — a black card is a 闪.
// Query skill: any black card can be played as a dodge.

import type { Skill } from '../skillTypes.js';

export const qingguo: Skill = {
  id: 'qingguo',
  locked: false,
  queries: {
    cardsAs: (G, owner, cards, as) => {
      if (as !== 'dodge') return false;
      // Any black card (clubs or spades) counts as a 闪
      return cards.every(card => card.suit === 'clubs' || card.suit === 'spades');
    },
  },
};
