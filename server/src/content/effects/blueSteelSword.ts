// 青釭剑 Blue-Steel Sword (range 2): 锁定技 — your 杀 ignores the target's
// armour. Modelled as the `ignoreArmour` patch on the in-flight `G.damage`
// (state.ts's own doc comment names this card as the reason the field
// exists), so 仁王盾's damage.before listener can check it and stand down.
//
// Priority is pinned to the equipment band's own floor (100) rather than left
// to default so it is explicit that this must resolve before anything that
// reads `ignoreArmour` — see renwangShield.ts, which sits at 105 specifically
// to run after this.

import type { SkillTrigger } from '../triggerTypes.js';
import { PRIORITY_EQUIPMENT } from '../triggerTypes.js';
import { getCard } from '../../engine/cardIndex.js';

export const blueSteelSwordTrigger: SkillTrigger = {
  id: 'equip.blue_steel_sword',
  event: 'damage.before',
  optional: false,
  priority: PRIORITY_EQUIPMENT,
  labelKey: 'card.blue_steel_sword',
  when: (_e, G, owner) => {
    const d = G.damage;
    if (!d || d.source !== owner || d.prevented) return false;
    return d.card !== undefined && getCard(d.card).effectKey === 'strike';
  },
  effect: () => [{ t: 'setDamage', patch: { ignoreArmour: true } }],
};
