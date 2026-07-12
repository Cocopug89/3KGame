// 护驾 (Cao Cao's Royal Guard, lord skill) — when you need to play a 闪,
// other Wei characters may, in turn order, play one on your behalf.
//
// Fires on `demand.open` for a 'dodge' demand raised ON the owner (Cao Cao
// himself) — the proxy loop is content/effects/lordProxy.ts's
// `hujia_proxy`, registered under kingdom 'wei'.

import type { Skill } from '../skillTypes.js';

export const hujia: Skill = {
  id: 'hujia',
  locked: false,
  lordOnly: true,
  triggers: [
    {
      id: 'skill.hujia',
      event: 'demand.open',
      optional: true,
      priority: 300, // PRIORITY_LORD_SKILL — explicit per skill-trigger-design §3.2's own band table
      labelKey: 'skill.hujia.name',
      when: (e, _G, owner) => e.event === 'demand.open' && e.kind === 'dodge' && e.from === owner,
      effect: (_e, _G, owner) => [{ t: 'effect', effectKey: 'hujia_proxy', ctx: { owner } }],
    },
  ],
};
