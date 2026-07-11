// Every skill, keyed exactly by content/standard/skills.json's `id` (task 4.1a).
//
// EMPTY ON PURPOSE — and that is the definition of done for 4.1b. The whole
// point of this task is that a skill is *pure content*: by the time 4.2 writes
// 武圣, there is nothing left to build in the engine, and the diff is one file
// under content/skills/ plus one line here. If a skill handler was tempting
// mid-4.1b, it meant a mechanism was missing and was about to be hidden inside
// a skill.
//
// 4.2 (Batch A — queries), 4.3 (Batch B — reactive triggers) and 4.4 (Batch C —
// proxies/retrials/actives) fill it in. The catalog of all 40, with hook ·
// optional · limit · batch for each, is docs/skill-trigger-design.md §8.

import type { SkillRegistry } from './skillTypes.js';

export const skillRegistry: SkillRegistry = {};

/** The registry key an active skill's CardEffect is dispatched under (the
 * `useSkill` move pushes `{t:'effect', effectKey: activeEffectKey(id)}`).
 * Namespaced so a skill can never collide with a card's effectKey. */
export function activeEffectKey(skillId: string): string {
  return `skill.${skillId}`;
}
