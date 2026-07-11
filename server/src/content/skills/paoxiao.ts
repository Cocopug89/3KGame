// 咆哮 (Zhang Fei's Roar) — no strike limit.
// Locked query skill: Zhang Fei can play unlimited 杀 per turn.

import type { Skill } from '../skillTypes.js';

export const paoxiao: Skill = {
  id: 'paoxiao',
  locked: true,
  queries: {
    strikeLimit: () => Infinity,
  },
};
