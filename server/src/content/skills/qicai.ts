// 奇才 (Huang Yueying's Ingenuity) — no distance limit on tricks.
// Locked query skill: Huang Yueying can play trick cards at any distance.

import type { Skill } from '../skillTypes.js';

export const qicai: Skill = {
  id: 'qicai',
  locked: true,
  queries: {
    ignoresDistance: (G, owner, effectKey) => {
      // Check if this is a trick card (not 杀, 闪, 桃)
      const trickEffects = ['dismantle', 'steal', 'nullification', 'duress', 'duel', 'harvest', 'lightning', 'indulgence'];
      return trickEffects.includes(effectKey);
    },
  },
};
