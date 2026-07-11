// 仁王盾 Renwang Shield: 锁定技 — a black (♠/♣) 杀 deals you no damage.
// Modelled as a damage.before PREVENTION, not an un-targetable check
// (skill-trigger-design §2.1's own note on this exact card: "黑色【杀】对你无效
// is modelled as a damage.before prevention... a 杀 that deals no damage does
// nothing else — strike.dodged only fires when a 闪 was actually supplied, so
// 青龙偃月刀/贯石斧 correctly stay quiet").
//
// Priority 105 — after blueSteelSword.ts's 100, so 青釭剑's `ignoreArmour`
// patch (if the attacker has it) has already landed on G.damage by the time
// this reads it. 青釭剑 explicitly makes your 杀 "ignore the target's armour",
// and 仁王盾 is the only piece of Standard armour with a damage-blocking
// effect, so this is the one listener that flag has to reach.

import type { SkillTrigger } from '../triggerTypes.js';
import { getCard } from '../../engine/cardIndex.js';

const BLACK_SUITS = new Set(['spades', 'clubs']);

export const renwangShieldTrigger: SkillTrigger = {
  id: 'equip.renwang_shield',
  event: 'damage.before',
  optional: false,
  priority: 105,
  labelKey: 'card.renwang_shield',
  when: (_e, G, owner) => {
    const d = G.damage;
    if (!d || d.target !== owner || d.prevented || d.ignoreArmour) return false;
    if (d.card === undefined) return false;
    const card = getCard(d.card);
    return card.effectKey === 'strike' && BLACK_SUITS.has(card.suit);
  },
  effect: () => [{ t: 'setDamage', patch: { prevented: true } }],
};
