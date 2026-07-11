// The Skill type — docs/skill-trigger-design.md §1. Mirrors effectTypes.ts /
// effectRegistry.ts exactly (same folder, same conventions, same reasons).
//
// A skill has THREE FACES, because engine-design §4's single `Trigger`
// abstraction covers only about half of the Standard 25:
//
//   triggers — event hooks (奸雄, 遗计, 洛神…): the fan-out in engine/triggers.ts
//   queries  — synchronous folds over live state (武圣, 咆哮, 空城, 龙胆…): these
//              have no event to hang on and would otherwise become rule-shaped
//              `if`s inside playCard/validateTargets/the demand protocol
//   active   — an action-phase entry, reusing CardEffect UNCHANGED (仁德, 制衡,
//              观星, 结姻…)
//
// A skill may have more than one (裸衣 is an optional trigger *and* two locked
// queries — §11's split pattern). None is mandatory.

import type { CardEffect } from './effectTypes.js';
import type { QueryHandlers } from './queryTypes.js';
import type { SkillTrigger } from './triggerTypes.js';

export type SkillId = string; // 'wusheng' — matches content/standard/skills.json .id

export interface Skill {
  id: SkillId;
  /** 锁定技 — mandatory, never prompts. For triggers this is just
   * `optional: false`; for queries it is load-bearing (§4: only locked skills
   * may answer the folds the engine cannot stop to ask about). */
  locked: boolean;
  /** 主公技 — only live while this player holds the 'lord' role (护驾/激将/救援). */
  lordOnly?: boolean;

  triggers?: SkillTrigger[];
  queries?: Partial<QueryHandlers>;
  /** The same interface cards already use. Invoked by the `useSkill` move on
   * the act stage, which registers it into the effect registry under
   * `skill.<id>` — so an active skill resolves through exactly the machinery a
   * card does, including multi-step requests and resume frames. */
  active?: CardEffect;
  /** 每回合限一次 on an ACTIVE skill (制衡, 反间, 结姻, 青囊, 离间). Trigger limits
   * are declared on the trigger itself (SkillTrigger.limit). Engine-enforced —
   * a skill must never re-implement its own limit check (§3.5). */
  activeLimit?: 'unlimited' | 'once_per_turn' | 'once_per_phase';
}

export type SkillRegistry = Record<SkillId, Skill>;
