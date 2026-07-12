// 遗计 (Guo Jia's Legacy) — after you take damage, you may draw two cards and
// distribute them (to any characters, including yourself) freely.
//
// `once_per_damage` (skill-trigger-design §3.5): scoped to the DAMAGE
// INSTANCE (DamageInfo.seq), not the turn — Standard hits are all 1 point so
// this is theoretical today, but a per-turn counter here would silently halve
// 郭嘉 the moment an expansion deals >1 point in one hit.
//
// The draw and the distribution can't happen in one synchronous return (the
// distribution needs the drawn cards' real ids, which don't exist until
// AFTER {t:'draw'} resolves) — so this trigger's effect only pushes the draw
// plus a hop into `yiji_distribute` (content/effects/yijiDistribute.ts), the
// one-shot internal effect that reads the newly drawn ids back off the hand
// and asks how to split them up.

import type { Skill } from '../skillTypes.js';

export const yiji: Skill = {
  id: 'yiji',
  locked: false,
  triggers: [
    {
      id: 'skill.yiji',
      event: 'damage.after',
      optional: true,
      limit: 'once_per_damage',
      labelKey: 'skill.yiji.name',
      when: (e, G, owner) => e.event === 'damage.after' && e.target === owner,
      effect: (_e, _G, owner) => [
        { t: 'draw', player: owner, count: 2 },
        { t: 'effect', effectKey: 'yiji_distribute', ctx: { owner } },
      ],
    },
  ],
};
