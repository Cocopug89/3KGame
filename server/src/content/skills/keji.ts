// 克己 (Lu Meng's Self-Restraint) — skip discard if no strike used/played this turn.
// Trigger skill: if Lu Meng didn't use or play a 杀 in the action phase, he skips his discard phase.
//
// Per skill-trigger-design.md §2.2: "克己's counter is NOT strikesPlayed. The rule is
// '若你未于出牌阶段使用或打出过杀' — a 杀 played in response counts too. 4.1b maintains
// a second, separate turn flag: turnFlags['strikeUsedInAction'], set whenever a 杀 is
// played or supplied while G.turnPhase === 'action'."

import type { Skill } from '../skillTypes.js';
import type { Frame } from '../../engine/frames.js';

export const keji: Skill = {
  id: 'keji',
  locked: false,
  triggers: [
    {
      id: 'skill.keji',
      event: 'phase.end',
      optional: true,
      labelKey: 'skill.keji.name',
      when: (e, G, owner) => {
        // Only fire at the end of the action phase
        if (e.event !== 'phase.end' || e.phase !== 'action' || e.player !== owner) {
          return false;
        }
        // Only fire if no strike was used or supplied this action phase
        return !G.turnFlags.strikeUsedInAction;
      },
      effect: (e, G, owner): Frame[] => {
        // Skip the discard phase
        return [{ t: 'skipPhase', phase: 'discard' }];
      },
    },
  ],
};
