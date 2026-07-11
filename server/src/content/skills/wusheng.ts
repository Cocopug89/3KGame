// 武圣 (Guan Yu's God of War) — a red card is a 杀.
// Query skill: any red card can be played as a strike.

import type { Skill } from '../skillTypes.js';

export const wusheng: Skill = {
  id: 'wusheng',
  locked: false,
  queries: {
    cardsAs: (G, owner, cards, as) => {
      if (as !== 'strike') return false;
      // Any red card (diamonds or hearts) counts as a 杀
      return cards.every(card => card.suit === 'diamonds' || card.suit === 'hearts');
    },
  },
};
