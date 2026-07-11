// 青龙偃月刀 Green Dragon Blade (range 3): 锁定技 — when your 杀 is dodged, you
// may immediately play another 杀. Simplification, flagged for whoever next
// touches this: the real card restricts the follow-up 杀 to the same target
// who just dodged; this grants one extra strike for the turn generally rather
// than opening a target-pinned request (there is no existing request kind for
// "play a specific-effectKey card, exempt from the normal limit, at a fixed
// target" and inventing one means a new bgio stage, out of this task's file
// ownership — see docs/handoff/3.5-3.6-equipment.md).
//
// Modelled the way §11's 裸衣 pattern prescribes for anything that changes a
// LOCKED-ONLY fold (strikeLimit): a mandatory TRIGGER records the grant as a
// turn flag ({t:'flag'}, the one sanctioned way for content to write turn
// state), and a LOCKED query reads it. 锁定技, so `optional: false` — the
// extra chance is automatic, never prompted.

import type { SkillTrigger } from '../triggerTypes.js';
import { PRIORITY_EQUIPMENT } from '../triggerTypes.js';
import type { QueryHandlers } from '../queryTypes.js';

const EXTRA_STRIKES_FLAG = 'equip.green_dragon_blade.extraStrikes';

export const greenDragonBladeTrigger: SkillTrigger = {
  id: 'equip.green_dragon_blade',
  event: 'strike.dodged',
  optional: false,
  priority: PRIORITY_EQUIPMENT,
  labelKey: 'card.green_dragon_blade',
  when: (e, _G, owner) => e.event === 'strike.dodged' && e.source === owner,
  effect: (_e, G, _owner) => {
    const current = (G.turnFlags[EXTRA_STRIKES_FLAG] as number | undefined) ?? 0;
    return [{ t: 'flag', key: EXTRA_STRIKES_FLAG, value: current + 1 }];
  },
};

export const greenDragonBladeQuery: Partial<QueryHandlers> = {
  strikeLimit: (G, _owner, current) =>
    current + ((G.turnFlags[EXTRA_STRIKES_FLAG] as number | undefined) ?? 0),
};
