// 麒麟弓 Unicorn Bow (range 5): when your 杀 deals damage, you may discard one
// of the target's horse cards. Optional — the owner is prompted
// (confirmSkill). Priority 110: after renwangShield.ts's 105, so a black-杀
// prevention (or blueSteelSword's ignoreArmour feeding it) has already been
// decided — a 杀 that ultimately deals no damage should not also cost the
// target a horse.
//
// Simplification, flagged for whoever next needs it: when the target has
// BOTH a +1 and a -1 horse, the real card lets the attacker pick which to
// discard. This picks the +1 horse deterministically instead of opening a
// second chooseCard round-trip for a board state that is rare in Standard
// (needs two horse cards on one player) — see
// docs/handoff/3.5-3.6-equipment.md.

import type { SkillTrigger } from '../triggerTypes.js';
import { getCard } from '../../engine/cardIndex.js';

export const unicornBowTrigger: SkillTrigger = {
  id: 'equip.unicorn_bow',
  event: 'damage.before',
  optional: true,
  priority: 110,
  labelKey: 'card.unicorn_bow',
  when: (_e, G, owner) => {
    const d = G.damage;
    if (!d || d.source !== owner || d.prevented || d.amount <= 0) return false;
    if (d.card === undefined || getCard(d.card).effectKey !== 'strike') return false;
    const target = G.players[d.target];
    return !!target && (target.equipment.plusHorse !== null || target.equipment.minusHorse !== null);
  },
  effect: (_e, G, owner) => {
    const d = G.damage;
    if (!d) return [];
    const target = G.players[d.target];
    const horseId = target?.equipment.plusHorse ?? target?.equipment.minusHorse;
    if (!horseId) return [];
    return [
      {
        t: 'moveCards',
        cards: [horseId],
        from: { z: 'equip', player: d.target },
        to: { z: 'discard' },
        by: owner,
      },
    ];
  },
};
