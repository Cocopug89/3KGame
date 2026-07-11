// The one trigger type. docs/skill-trigger-design.md §1: skills and equipment
// share it — "3.6 must not invent a second trigger type; if it does, every
// ordering rule in §3 has to be written twice, and they will drift."
//
// The fan-out that consumes these ships in task 3.2 (engine/triggers.ts), per
// 4.1 §0.5. The *registries* they live in are filled later: equipment in 3.6,
// skills in 4.1b.

import type { GState, PlayerId } from '../engine/state.js';
import type { Frame, TriggerEvent } from '../engine/frames.js';

/** 4.1 §3.5 — engine-enforced, never re-implemented inside a `when()`. The
 * counters land with 4.1b; the field exists now so 3.6's equipment triggers
 * can declare themselves honestly from day one. */
export type TriggerLimit = 'unlimited' | 'once_per_turn' | 'once_per_phase' | 'once_per_damage';

/** 4.1 §3.2 priority bands. Lower runs first. */
export const PRIORITY_EQUIPMENT = 100;
export const PRIORITY_SKILL = 200;
export const PRIORITY_LORD_SKILL = 300;

export interface SkillTrigger {
  /** Unique — keys both the ordering tiebreak and the limit counters. */
  id: string;
  event: TriggerEvent['event'];
  /** Optional ⇒ the engine asks the owner a yes/no first (4.1 §3.4, built in
   * 4.1b). Mark honestly: an optional trigger that should be mandatory turns
   * the game into eleven prompts a turn. */
  optional: boolean;
  /** §3.2 bands. Optional: the skill source (content/skillSource.ts) fills in
   * the band a skill belongs to (200, or 300 for a 主公技), so a skill only sets
   * this to override. Equipment must set it explicitly — PRIORITY_EQUIPMENT —
   * because equipment resolving before skills on the same event (八卦阵 before a
   * skill reacting to the dodge) is a RULE, not a default. Missing ⇒ 200. */
  priority?: number;
  /** i18n key naming this trigger in the `confirmSkill` prompt an OPTIONAL
   * trigger raises ('skill.jianxiong.name', 'card.frost_blade.name'). Falls
   * back to the trigger id, which is never wrong, only ugly. */
  labelKey?: string;
  limit?: TriggerLimit;
  /** Live-state predicate. Cheap, pure, no side effects — called during
   * fan-out AND re-called at pop time (§3.3). Returning false is also how a
   * trigger declines to prompt when it provably can't do anything. */
  when(e: TriggerEvent, G: GState, owner: PlayerId): boolean;
  /** Same contract as CardEffect.resolve: returns frames in narrative order,
   * NEVER mutates G (engine-design §3). */
  effect(e: TriggerEvent, G: GState, owner: PlayerId): Frame[];
}

/**
 * How the engine finds listeners without a subscription table (engine-design
 * §4 decision 1, restated in 4.1 §1): each source is asked, for a living
 * player, "which of your triggers are registered right now?" — reading live
 * state every single time. Equipment gets stolen and destroyed mid-resolution;
 * a subscription list would go stale exactly when it matters.
 *
 * 3.2 ships the mechanism with one source (equipment, whose registry is empty
 * until 3.6). 4.1b appends the skill source. Nothing else should ever need to.
 */
export interface TriggerSource {
  name: string;
  triggersFor(G: GState, owner: PlayerId): readonly SkillTrigger[];
}
