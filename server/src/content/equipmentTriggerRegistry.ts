// Weapon/armour behaviour is triggers, not CardEffects (engine-design §3,
// skill-trigger-design §1) — keyed by the same `effectKey` as the card itself
// (content/standard/cards.json), so an equipped 青龙偃月刀 contributes its
// triggers simply by sitting in a slot.
//
// Task 3.6 fills this in. 8 of the 11 weapon/armour pieces register a trigger
// here; 诸葛连弩/丈八蛇矛/方天画戟 are pure queries (equipmentQueryRegistry.ts)
// with no event to hang a listener on.

import type { SkillTrigger, TriggerSource } from './triggerTypes.js';
import type { GState, PlayerId } from '../engine/state.js';

import { genderSwordsTrigger } from './effects/genderSwords.js';
import { blueSteelSwordTrigger } from './effects/blueSteelSword.js';
import { frostBladeTrigger } from './effects/frostBlade.js';
import { rockCleavingAxeTrigger } from './effects/rockCleavingAxe.js';
import { greenDragonBladeTrigger } from './effects/greenDragonBlade.js';
import { unicornBowTrigger } from './effects/unicornBow.js';
import { eightTrigramsTrigger } from './effects/eightTrigrams.js';
import { renwangShieldTrigger } from './effects/renwangShield.js';

export const equipmentTriggerRegistry: Record<string, SkillTrigger[]> = {
  gender_swords: [genderSwordsTrigger],
  blue_steel_sword: [blueSteelSwordTrigger],
  frost_blade: [frostBladeTrigger],
  rock_cleaving_axe: [rockCleavingAxeTrigger],
  green_dragon_blade: [greenDragonBladeTrigger],
  unicorn_bow: [unicornBowTrigger],
  eight_trigrams: [eightTrigramsTrigger],
  renwang_shield: [renwangShieldTrigger],
};

/** Live read of the four equipment slots — never a cached list (see
 * TriggerSource's comment, and engine-design §4's 青釭剑 case). */
export const equipmentTriggerSource: TriggerSource = {
  name: 'equipment',
  triggersFor(G: GState, owner: PlayerId): readonly SkillTrigger[] {
    const player = G.players[owner];
    if (!player) return [];
    const out: SkillTrigger[] = [];
    for (const cardId of Object.values(player.equipment)) {
      if (!cardId) continue;
      const triggers = equipmentTriggerRegistry[effectKeyOfEquipped(G, cardId)];
      if (triggers) out.push(...triggers);
    }
    return out;
  },
};

// Split out so the import of cardIndex stays local to this file (the registry
// is keyed by effectKey, but equipment slots store card ids).
import { getCard } from '../engine/cardIndex.js';
function effectKeyOfEquipped(_G: GState, cardId: string): string {
  return getCard(cardId).effectKey;
}
