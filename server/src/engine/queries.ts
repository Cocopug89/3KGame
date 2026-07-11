// The synchronous fold — docs/skill-trigger-design.md §4.
//
// Engine-side, because the ENGINE is the one asking. Content only contributes
// handlers (content/querySources.ts → skills + equipment); this module owns the
// fold *rules*, which are not uniform and must not be improvised per call site:
//
//   OR-folded      cardsAs, ignoresDistance     — any provider may GRANT
//   AND-folded     targetable                   — any provider may FORBID, and a
//                                                  prohibition must never be
//                                                  overridable by a permission
//   chained        strikeLimit, drawCount,      — each provider receives the
//                  demandCount, targetLimit,      running value and returns the
//                  distanceModifier               next, in §3.2 priority order
//                                                  (equipment before skills), so
//                                                  stacking two modifiers is
//                                                  DEFINED rather than incidental
//
// Every fold reads live state on every call — no caching, no memoisation. See
// queryTypes.ts's QuerySource comment for why that is a correctness requirement
// and not a performance question.
//
// This module must not import boardgame.io — see docs/engine-design.md §8.

import type { GState, PlayerId } from './state.js';
import type { CardDef } from './cardIndex.js';
import type { QueryProvider } from '../content/queryTypes.js';
import { querySources } from '../content/querySources.js';

/** Every provider `owner` has right now, in §3.2 priority order. */
export function providersOf(G: GState, owner: PlayerId): QueryProvider[] {
  const out: QueryProvider[] = [];
  for (const source of querySources) out.push(...source.providersFor(G, owner));
  return out.sort((a, b) => a.priority - b.priority);
}

function livingPlayers(G: GState): PlayerId[] {
  return G.seats.filter((id) => G.players[id]?.alive);
}

/**
 * 视为 — may `owner` use `cards` as a `as`? (`as` is an effectKey: 'strike',
 * 'dodge', 'peach', 'nullification'.)
 *
 * The BASE rule, which no skill contributes and every caller relies on: a single
 * card that simply *is* one answers for itself. Everything on top of that is a
 * permission (武圣: a red card may be played as a 杀), and permissions OR
 * together.
 *
 * PERMISSIVE, NOT AUTOMATIC (§4). 武圣 doesn't make a ♥K *be* a 杀 — it permits
 * the claim. The move names what the player is playing the card AS, and this
 * validates it. The physical ♥K still hits the discard pile as a ♥K, which is
 * why 铁骑 and 雌雄双股剑 correctly still see a heart.
 */
export function cardsAs(
  G: GState,
  owner: PlayerId,
  cards: readonly CardDef[],
  as: string,
): boolean {
  if (cards.length === 1 && cards[0].effectKey === as) return true;
  return providersOf(G, owner).some((p) => p.handlers.cardsAs?.(G, owner, cards, as) ?? false);
}

/** 咆哮 (⇒ Infinity) · 诸葛连弩 (3.6). Chained; locked-only (§4). */
export function strikeLimit(G: GState, owner: PlayerId, base = 1): number {
  return providersOf(G, owner).reduce(
    (current, p) => p.handlers.strikeLimit?.(G, owner, current) ?? current,
    base,
  );
}

/** 英姿 (+1) · 裸衣 (−1). Chained; locked-only. Never below 0. */
export function drawCount(G: GState, owner: PlayerId, base: number): number {
  const n = providersOf(G, owner).reduce(
    (current, p) => p.handlers.drawCount?.(G, owner, current) ?? current,
    base,
  );
  return Math.max(0, n);
}

/** 无双 (⇒ 2). Chained; locked-only. `owner` is who RAISED the demand. */
export function demandCount(G: GState, owner: PlayerId, kind: string, base: number): number {
  return providersOf(G, owner).reduce(
    (current, p) => p.handlers.demandCount?.(G, owner, kind, current) ?? current,
    base,
  );
}

/** 方天画戟 (3.6). Chained; locked-only. */
export function targetLimit(
  G: GState,
  owner: PlayerId,
  effectKey: string,
  base: number,
): number {
  return providersOf(G, owner).reduce(
    (current, p) => p.handlers.targetLimit?.(G, owner, effectKey, current) ?? current,
    base,
  );
}

/**
 * 马术 (the owner is the one measuring) · 飞影-shaped skills (the owner is the
 * one being measured). Summed over EVERY living player's providers, because a
 * distance modifier is a property of a player who may be at either end of the
 * measurement — which is why the handler takes `from`, `to` AND `owner` and
 * decides for itself which end it cares about.
 */
export function distanceModifier(G: GState, from: PlayerId, to: PlayerId): number {
  let mod = 0;
  for (const owner of livingPlayers(G)) {
    for (const p of providersOf(G, owner)) {
      mod += p.handlers.distanceModifier?.(G, from, to, owner) ?? 0;
    }
  }
  return mod;
}

/**
 * 空城 · 谦逊 — may `owner` be targeted by `effectKey` played by `source`?
 * AND-folded: one "no" is final.
 */
export function targetable(
  G: GState,
  owner: PlayerId,
  source: PlayerId,
  effectKey: string,
): boolean {
  return providersOf(G, owner).every(
    (p) => p.handlers.targetable?.(G, owner, source, effectKey) ?? true,
  );
}

/** 奇才 — does `owner` ignore the distance limit for `effectKey`? OR-folded. */
export function ignoresDistance(G: GState, owner: PlayerId, effectKey: string): boolean {
  return providersOf(G, owner).some(
    (p) => p.handlers.ignoresDistance?.(G, owner, effectKey) ?? false,
  );
}
