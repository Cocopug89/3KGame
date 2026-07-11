// 闭月 (Diao Chan's Moonlight) — draw 1 at the start of the end phase.
// Trigger skill: Diao Chan draws an extra card at the beginning of the end phase.

import type { Skill } from '../skillTypes.js';
import type { Frame } from '../../engine/frames.js';

export const biyue: Skill = {
  id: 'biyue',
  locked: false,
  triggers: [
    {
      id: 'skill.biyue',
      event: 'phase.start',
      optional: true,
      labelKey: 'skill.biyue.name',
      when: (e, G, owner) => {
        // Only fire at the start of the end phase
        return e.event === 'phase.start' && e.phase === 'end' && e.player === owner;
      },
      effect: (e, G, owner): Frame[] => {
        // Draw 1 card
        return [{ t: 'draw', player: owner, count: 1 }];
      },
    },
  ],
};
