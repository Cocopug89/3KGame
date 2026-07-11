// 每回合限一次 — docs/skill-trigger-design.md §3.5.
//
// LIMITS ARE ENGINE-ENFORCED, NEVER SKILL-ENFORCED. A skill's when() must not
// re-implement its own limit check: one mechanism, one place. The counters live
// in G.turnFlags (turn-scoped, serialisable, wiped by {t:'turnEnd'}) and are
// spent at the moment a trigger's effect actually RUNS — so declining an
// optional skill does not consume its once-per-turn (§3.4).
//
// This module must not import boardgame.io — see docs/engine-design.md §8.

import type { GState } from './state.js';
import type { TriggerEvent } from './frames.js';
import type { TriggerLimit } from '../content/triggerTypes.js';

const PHASE_PREFIX = 'usedPhase.';

/**
 * The turnFlags key this (trigger, event) pair spends, or null if it is
 * unlimited.
 *
 * `once_per_damage` is scoped to the damage *instance* (DamageInfo.seq), NOT to
 * the turn. 遗计 is "每当你受到1点伤害后" — per POINT of damage — and Standard
 * hits are all 1 point, so a per-turn counter here would look right forever and
 * silently halve 郭嘉 on the first expansion whose hits aren't. That is the kind
 * of bug nobody finds.
 */
export function limitKey(
  triggerId: string,
  limit: TriggerLimit | undefined,
  ev: TriggerEvent,
): string | null {
  switch (limit ?? 'unlimited') {
    case 'unlimited':
      return null;
    case 'once_per_turn':
      return `used.${triggerId}`;
    case 'once_per_phase':
      return `${PHASE_PREFIX}${triggerId}`;
    case 'once_per_damage': {
      if (ev.event !== 'damage.after') {
        throw new Error(
          `limitKey: trigger '${triggerId}' declares once_per_damage but listens to '${ev.event}', ` +
            `which carries no damage instance to scope the limit to (docs/skill-trigger-design.md §3.5).`,
        );
      }
      return `usedDamage.${ev.seq}.${triggerId}`;
    }
  }
}

export function limitSpent(
  G: GState,
  triggerId: string,
  limit: TriggerLimit | undefined,
  ev: TriggerEvent,
): boolean {
  const key = limitKey(triggerId, limit, ev);
  return key !== null && G.turnFlags[key] === true;
}

export function spendLimit(
  G: GState,
  triggerId: string,
  limit: TriggerLimit | undefined,
  ev: TriggerEvent,
): void {
  const key = limitKey(triggerId, limit, ev);
  if (key !== null) G.turnFlags[key] = true;
}

/** once_per_phase counters reset at the start of every phase (§3.5). */
export function clearPhaseLimits(G: GState): void {
  for (const key of Object.keys(G.turnFlags)) {
    if (key.startsWith(PHASE_PREFIX)) delete G.turnFlags[key];
  }
}

/** An ACTIVE skill's limit (制衡, 反间, 结姻, 青囊, 离间 — 每回合限一次), spent by
 * the `useSkill` move. Same counters, same namespace, so a skill with both a
 * trigger and an active cannot accidentally share one. */
export function activeLimitKey(skillId: string, limit: 'unlimited' | 'once_per_turn' | 'once_per_phase' | undefined): string | null {
  switch (limit ?? 'unlimited') {
    case 'unlimited':
      return null;
    case 'once_per_turn':
      return `used.active.${skillId}`;
    case 'once_per_phase':
      return `${PHASE_PREFIX}active.${skillId}`;
  }
}
