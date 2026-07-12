// 铁骑 (Ma Chao's Iron Cavalry) — after you name a target with a 杀, you may
// judge: if the result is red, that 杀 cannot be dodged at all.
//
// The judge itself is ordinary (`{t:'judge'}` + an onResult effectKey,
// exactly like any other judgement). The interesting part is how the result
// reaches strike.ts: this trigger fires on `card.target`, which strike.ts's
// OWN resume frame is not yet the top of the stack for (the request/judge
// this trigger raises sits above it) — so `applyToResumeFrame` cannot be used
// here (docs/skill-trigger-design.md's "writes into the strike's resume
// ctx", read literally: through the ctx, never by editing the frame). The
// channel is `G.turnFlags`, the same one every skill uses to write turn
// state: `tieji_result` (below) sets `tieji.forceHit`, and
// content/effects/strike.ts reads and clears it the moment its OWN resume
// frame IS on top (see that file's header for the full ordering argument).

import type { Skill } from '../skillTypes.js';

export const tieji: Skill = {
  id: 'tieji',
  locked: false,
  triggers: [
    {
      id: 'skill.tieji',
      event: 'card.target',
      optional: true,
      labelKey: 'skill.tieji.name',
      when: (e, G, owner) =>
        e.event === 'card.target' && e.effectKey === 'strike' && e.source === owner && G.drawPile.length > 0,
      effect: (_e, _G, owner) => [
        { t: 'judge', target: owner, reasonKey: 'judge.tieji', onResult: 'tieji_result' },
      ],
    },
  ],
};
