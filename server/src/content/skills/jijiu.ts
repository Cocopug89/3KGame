// 急救 (Hua Tuo's First Aid) — a query, not the demand.open proxy the earlier
// design-catalog draft (skill-trigger-design §8) sketched. §11's cross-check
// confirmed the simpler wording verbatim against sources and the locale text
// matches it exactly: "Outside your own turn, you may use any red card as a
// Peach." That's `cardsAs('peach')` gated on "it is not currently your own
// turn" — no proxy, no demand.open listener, no new mechanism at all. Hua Tuo
// answers a 'peach' demand raised ON HIMSELF (dying.ts's asker ordering, or
// any future peach demand) through the ordinary cardsAs fold every demand
// already consults (pump.ts's demandAsk).

import type { Skill } from '../skillTypes.js';

export const jijiu: Skill = {
  id: 'jijiu',
  locked: false,
  queries: {
    cardsAs: (G, owner, cards, as) => {
      if (as !== 'peach') return false;
      if (G.seats[G.activeSeat] === owner) return false; // not on your own turn
      return cards.length === 1 && (cards[0].suit === 'diamonds' || cards[0].suit === 'hearts');
    },
  },
};
