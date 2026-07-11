// Distance & range — pulled forward from task 2.5 because task 2.4's strike
// targeting needs attack-range validation to be rules-correct. Pure
// functions, no state mutation, no boardgame.io import (§8). Formula pinned
// in docs/engine-design.md §7:
//
//   seatDistance(a,b) = min(clockwiseLivingSteps(a,b), clockwiseLivingSteps(b,a))   // dead seats don't count
//   distance(from,to) = seatDistance(from,to) − (from has −1 horse ? 1 : 0) + (to has +1 horse ? 1 : 0)
//                       + queries.distanceModifier(from,to)          // 马术 (task 4.1b)
//                       clamped to a minimum of 1
//   attackRange(p)    = weapon ? weaponRange(weapon) : 1
//   inAttackRange(a,b)= distance(a,b) ≤ attackRange(a)
//
// Note the asymmetry — distance(a,b) ≠ distance(b,a) when horses are
// involved. That is the rule, not a bug.

import type { GState, PlayerId } from './state.js';
import { getCard } from './cardIndex.js';
import { distanceModifier } from './queries.js';

/** Living players in seat order (the circle dead players have been removed
 * from — they don't count as a step, but they also don't collapse the
 * circle for the players still in it; see plan §2 "distance" mechanics). */
function livingSeatOrder(G: GState): PlayerId[] {
  return G.seats.filter((id) => G.players[id]?.alive);
}

/** Raw seat distance: the shorter of the two directions around the circle
 * of *living* players, ignoring equipment. */
export function seatDistance(G: GState, from: PlayerId, to: PlayerId): number {
  if (from === to) return 0;
  const order = livingSeatOrder(G);
  const i = order.indexOf(from);
  const j = order.indexOf(to);
  if (i === -1) throw new Error(`seatDistance: '${from}' is not a living seated player`);
  if (j === -1) throw new Error(`seatDistance: '${to}' is not a living seated player`);
  const n = order.length;
  const clockwise = (j - i + n) % n;
  const counterClockwise = (i - j + n) % n;
  return Math.min(clockwise, counterClockwise);
}

/** Horse-adjusted distance *from* `from` *to* `to`. Asymmetric by design:
 * a −1 horse only helps its owner attack outward; a +1 horse only helps its
 * owner defend against incoming attacks. Clamped to a minimum of 1 — you are
 * never "closer than adjacent" even after horse bonuses stack. */
export function distance(G: GState, from: PlayerId, to: PlayerId): number {
  if (from === to) return 0;
  const base = seatDistance(G, from, to);
  const attackerBonus = G.players[from].equipment.minusHorse ? 1 : 0;
  const defenderPenalty = G.players[to].equipment.plusHorse ? 1 : 0;
  // 马术 and friends (task 4.1b, skill-trigger-design §4). A skill modifier is
  // folded in at exactly the same point a horse is — deliberately, because 马术
  // *is* "you have a permanent −1 horse", and the two must stack the same way.
  const skills = distanceModifier(G, from, to);
  return Math.max(1, base - attackerBonus + defenderPenalty + skills);
}

/** The attack range `p` currently has: their equipped weapon's range, or 1
 * (bare hands / no weapon) — plan §3.3. */
export function attackRange(G: GState, p: PlayerId): number {
  const weaponId = G.players[p].equipment.weapon;
  if (!weaponId) return 1;
  const weapon = getCard(weaponId);
  // Every weapon card carries `range` (task 2.2a); this would only be
  // undefined for a content-data bug, which is exactly what
  // server/test/content.test.ts guards against.
  return weapon.range ?? 1;
}

/** Whether `from` can target `to` with an attack-range card (杀 and similar). */
export function inAttackRange(G: GState, from: PlayerId, to: PlayerId): boolean {
  return distance(G, from, to) <= attackRange(G, from);
}
