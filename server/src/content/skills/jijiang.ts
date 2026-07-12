// 激将 (Liu Bei's Bravery, lord skill) — when you need to play a 杀, other
// Shu characters may, in turn order, play one on your behalf.
//
// Same shape as 护驾 (hujia.ts) — content/effects/lordProxy.ts's
// `jijiang_proxy`, registered under kingdom 'shu' and demand kind 'strike'
// (covers both 杀→闪's demand FROM a Shu ally answering for Liu Bei being
// duelled, and a 决斗's per-round 杀 demand).

import type { Skill } from '../skillTypes.js';

export const jijiang: Skill = {
  id: 'jijiang',
  locked: false,
  lordOnly: true,
  triggers: [
    {
      id: 'skill.jijiang',
      event: 'demand.open',
      optional: true,
      priority: 300,
      labelKey: 'skill.jijiang.name',
      when: (e, _G, owner) => e.event === 'demand.open' && e.kind === 'strike' && e.from === owner,
      effect: (_e, _G, owner) => [{ t: 'effect', effectKey: 'jijiang_proxy', ctx: { owner } }],
    },
  ],
};
