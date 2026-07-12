// 国色 (Da Qiao's National Beauty) — any Diamond card may be used as 乐不思蜀
// (indulgence). The Batch A pickup that needed 3.4's indulgence effect
// (which is done — see docs/handoff/3.4-complex-tricks.md); implemented
// alongside Batch C per finish-workflow-plan.md's Lane F.

import type { Skill } from '../skillTypes.js';

export const guose: Skill = {
  id: 'guose',
  locked: false,
  queries: {
    cardsAs: (_G, _owner, cards, as) => {
      if (as !== 'indulgence') return false;
      return cards.length === 1 && cards[0].suit === 'diamonds';
    },
  },
};
