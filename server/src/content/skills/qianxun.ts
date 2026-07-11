// 谦逊 (Lu Xun's Modesty) — cannot be targeted by dismantle or indulgence.
// Locked query skill: 过河拆桥 and 乐不思蜀 cannot target Lu Xun.

import type { Skill } from '../skillTypes.js';

export const qianxun: Skill = {
  id: 'qianxun',
  locked: true,
  queries: {
    targetable: (G, owner, source, effectKey) => {
      // Only blocks 过河拆桥 (dismantle) and 乐不思蜀 (indulgence)
      if (effectKey === 'dismantle' || effectKey === 'indulgence') {
        return false;
      }
      return true;
    },
  },
};
