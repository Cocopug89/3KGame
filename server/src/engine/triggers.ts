// The trigger fan-out. docs/skill-trigger-design.md §3 — the *mechanism* ships
// here in 3.2 (per that doc's §0.5) because judgement retrial (3.1 §1.3) and
// every 3.6 weapon need it long before Phase 4; 4.1b keeps the skill-level
// policy (per-skill priorities, optionality, limits).
//
// Two rules, and they are NOT the same rule (§3.3):
//
//   * The sorted listener list is a SNAPSHOT taken at fan-out. It fixes the
//     ORDER, and only the order.
//   * Each step re-derives ELIGIBILITY when it pops — owner still alive, owner
//     still owns that trigger, when() still true. Any failure ⇒ drop silently.
//
// Re-deriving the whole list at every step instead would let a listener insert
// new listeners into its own fan-out (a card gained mid-fan-out making some
// when() newly true), which is neither the rule nor terminating. Snapshotting
// closures and running them blind is the bug the "derive, never subscribe"
// architecture exists to prevent. You need both halves.
//
// This module must not import boardgame.io — see docs/engine-design.md §8.

import type { GState, PlayerId } from './state.js';
import type { Frame, TriggerEvent } from './frames.js';
import type { SkillTrigger } from '../content/triggerTypes.js';
import { PRIORITY_SKILL } from '../content/triggerTypes.js';
import { triggerSources } from '../content/triggerSources.js';

/** Every trigger `owner` currently has registered, from every source. Live
 * read, every time — no subscription table exists anywhere. */
export function triggersOf(G: GState, owner: PlayerId): readonly SkillTrigger[] {
  const out: SkillTrigger[] = [];
  for (const source of triggerSources) out.push(...source.triggersFor(G, owner));
  return out;
}

/** The single trigger `owner` has with this id, or undefined if they no longer
 * have it (equipment stolen mid-fan-out, general changed, …). */
export function findTrigger(
  G: GState,
  owner: PlayerId,
  triggerId: string,
): SkillTrigger | undefined {
  return triggersOf(G, owner).find((t) => t.id === triggerId);
}

/** Living players in seat order **starting from the current turn player** —
 * the standard 三国杀 tiebreak (由当前回合角色开始，按座位顺序). Never player-id
 * order, never insertion order (§3.1 step 2). */
export function seatOrderFromTurnPlayer(G: GState): PlayerId[] {
  const n = G.seats.length;
  const out: PlayerId[] = [];
  for (let step = 0; step < n; step++) {
    const id = G.seats[(G.activeSeat + step) % n];
    if (G.players[id]?.alive) out.push(id);
  }
  return out;
}

export interface Listener {
  owner: PlayerId;
  triggerId: string;
  priority: number;
}

/**
 * The order a player chose for their own simultaneously-eligible triggers,
 * keyed by owner (§3.1 step 3). Carried on the `{t:'trigger'}` frame and
 * answered by the `orderTriggers` move; absent on every fan-out that never had
 * to ask, which is all of them in Standard.
 */
export type TriggerOrder = Record<PlayerId, string[]>;

/**
 * §3.1 steps 1–3: collect every living player's matching, `when()`-passing
 * triggers, then sort by priority, then by seat order from the turn player —
 * and, for the one case where those two are not enough (the same owner with two
 * eligible triggers at the same priority), by the order that owner chose.
 *
 * Never by player id, never by insertion order: a silent tiebreak here is a
 * rules bug that first surfaces in an expansion, when nobody remembers this
 * code (§3.1's own warning).
 */
export function collectListeners(G: GState, ev: TriggerEvent, order?: TriggerOrder): Listener[] {
  const seatOrder = seatOrderFromTurnPlayer(G);
  const seatRank = new Map(seatOrder.map((id, i) => [id, i]));

  const listeners: Listener[] = [];
  for (const owner of seatOrder) {
    for (const trigger of triggersOf(G, owner)) {
      if (trigger.event !== ev.event) continue;
      if (!trigger.when(ev, G, owner)) continue;
      listeners.push({
        owner,
        triggerId: trigger.id,
        // Missing priority ⇒ the skill band (§3.2). The skill source already
        // fills it in; this keeps a hand-built trigger in a test honest.
        priority: trigger.priority ?? PRIORITY_SKILL,
      });
    }
  }

  return listeners.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const bySeat = (seatRank.get(a.owner) ?? 0) - (seatRank.get(b.owner) ?? 0);
    if (bySeat !== 0) return bySeat;
    // Same owner, same priority — the only case the two rules above cannot
    // separate, and the only one a player is ever asked about.
    const chosen = order?.[a.owner];
    if (!chosen) return 0;
    const ia = chosen.indexOf(a.triggerId);
    const ib = chosen.indexOf(b.triggerId);
    if (ia === -1 || ib === -1) return 0;
    return ia - ib;
  });
}

/**
 * The group of triggers one owner must be asked to ORDER before this fan-out
 * can be pushed, or null (the overwhelmingly common case) if nothing is
 * ambiguous.
 *
 * Ambiguous means: same owner, same priority, two or more eligible triggers on
 * this one event — priority and seat order have both had their say and neither
 * separates them. A group the owner has already ordered (their answer is in
 * `order`) is not ambiguous any more.
 */
export function ambiguousOrderGroup(
  G: GState,
  ev: TriggerEvent,
  order?: TriggerOrder,
  // Precomputed snapshot from the same G/ev/order — pump.ts's 'trigger' case
  // shares one collectListeners() run between this check and fanOut() instead
  // of collecting-and-sorting twice per event. Same values by construction.
  listeners: readonly Listener[] = collectListeners(G, ev, order),
): { owner: PlayerId; triggerIds: string[] } | null {
  const groups = new Map<string, Listener[]>();
  for (const listener of listeners) {
    const key = `${listener.owner}|${listener.priority}`;
    const group = groups.get(key);
    if (group) group.push(listener);
    else groups.set(key, [listener]);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const owner = group[0].owner;
    const triggerIds = group.map((l) => l.triggerId);
    const chosen = order?.[owner];
    if (chosen && triggerIds.every((id) => chosen.includes(id))) continue; // already answered
    return { owner, triggerIds };
  }
  return null;
}

/** The frames a `{t:'trigger'}` fan-out expands into: one `triggerStep` per
 * listener, in narrative order (pushFrames reverses them, so listeners[0] pops
 * first). */
export function fanOut(
  G: GState,
  ev: TriggerEvent,
  order?: TriggerOrder,
  listeners: readonly Listener[] = collectListeners(G, ev, order),
): Frame[] {
  return listeners.map((l) => ({
    t: 'triggerStep' as const,
    ev,
    owner: l.owner,
    triggerId: l.triggerId,
  }));
}
