// 马术 (Ma Chao's Horsemanship) — distance from him is −1.
// Locked query skill: others are 1 seat closer to Ma Chao.

import type { Skill } from '../skillTypes.js';

export const mashu: Skill = {
  id: 'mashu',
  locked: true,
  queries: {
    distanceModifier: (G, from, to, owner) => {
      // When measuring distance FROM Ma Chao TO someone else
      if (from === owner) return -1;
      return 0;
    },
  },
};
