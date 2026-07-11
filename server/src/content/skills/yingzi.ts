// 英姿 (Zhou Yu's Heroic Spirit) — draw one extra card.
// Locked query skill: Zhou Yu draws an additional card in the draw phase.

import type { Skill } from '../skillTypes.js';

export const yingzi: Skill = {
  id: 'yingzi',
  locked: true,
  queries: {
    drawCount: (G, owner, current) => current + 1,
  },
};
