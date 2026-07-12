// 救援 (Sun Quan's Rescue, lord skill, locked) — when another Wu character
// uses a 桃 on you while you are dying, you recover 1 EXTRA hp.
//
// `heal.after`'s payload carries the actual amount applied (post-clamp), not
// the raw card, so "while dying" is reconstructed as `target.hp (now) -
// amount <= 0` — the hp *before* this heal was at or below zero. Locked
// (mandatory): fires silently, no confirmSkill prompt.

import { generals } from '@3k/shared';
import type { Skill } from '../skillTypes.js';

const generalKingdom = new Map(generals.map((g) => [g.id, g.kingdom]));

export const jiuyuan: Skill = {
  id: 'jiuyuan',
  locked: true,
  lordOnly: true,
  triggers: [
    {
      id: 'skill.jiuyuan',
      event: 'heal.after',
      optional: false,
      when: (e, G, owner) => {
        if (e.event !== 'heal.after') return false;
        if (e.target !== owner) return false;
        if (!e.card) return false; // must be an actual 桃, not a bare heal
        if (e.source === null || e.source === owner) return false;
        if (generalKingdom.get(G.players[e.source]?.generalId ?? '') !== 'wu') return false;
        const before = G.players[owner].hp - e.amount;
        return before <= 0; // was dying
      },
      effect: (_e, _G, owner) => [{ t: 'heal', target: owner, amount: 1, source: null }],
    },
  ],
};
