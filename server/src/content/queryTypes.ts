// The query fold's types — docs/skill-trigger-design.md §4.
//
// A query is a question the engine must answer SYNCHRONOUSLY, mid-validation,
// with no possibility of blocking on a player: "may 关羽 play this ♥K as a 杀?"
// (武圣), "how many 杀 may 张飞 play this turn?" (咆哮), "may 诸葛亮 be targeted
// at all?" (空城). None of these has an event to hang on, and without them each
// one becomes a rule-shaped `if` inside playCard/validateTargets — which is the
// thing engine-design §3 exists to prevent.
//
// THE QUERY SET IS CLOSED, AND SMALL ON PURPOSE. Adding one is a design change:
// it means the engine is asking a new *kind* of question. The bias is strict —
// **if it can be an event, it is an event.** (This is exactly why damage.before
// is not here: 寒冰剑 is optional and must be able to block, and a fold cannot
// stop and ask. See §2.1.)

import type { GState, PlayerId } from '../engine/state.js';
import type { CardDef } from '../engine/cardIndex.js';

export interface QueryHandlers {
  /** 视为/转化 — "may `owner` use these card(s) as `as`?" Takes an ARRAY:
   * 丈八蛇矛 (3.6) turns TWO hand cards into one 杀. 武圣 · 龙胆 · 倾国 · 奇袭 ·
   * 国色 · 急救 all take one. OR-folded, and *permissive*: it does not make a
   * red card BE a 杀, it permits the claim the player made (§4.1). */
  cardsAs(G: GState, owner: PlayerId, cards: readonly CardDef[], as: string): boolean;
  /** 咆哮 · 诸葛连弩 (3.6). Chained: receives the running limit, returns the next. */
  strikeLimit(G: GState, owner: PlayerId, current: number): number;
  /** 马术 (owner is the measurer) · 飞影-shaped skills (owner is the measured).
   * Summed over every living player's providers — which is why it takes both
   * ends of the measurement *and* the owner. */
  distanceModifier(G: GState, from: PlayerId, to: PlayerId, owner: PlayerId): number;
  /** 空城 · 谦逊 — may `owner` be targeted by `effectKey` from `source`?
   * AND-folded: a prohibition must not be overridable by a permission. */
  targetable(G: GState, owner: PlayerId, source: PlayerId, effectKey: string): boolean;
  /** 奇才 — does `owner` ignore the distance limit for `effectKey`? OR-folded. */
  ignoresDistance(G: GState, owner: PlayerId, effectKey: string): boolean;
  /** 英姿 (+1) · 裸衣 (−1) — how many cards does `owner` draw in the draw phase? */
  drawCount(G: GState, owner: PlayerId, current: number): number;
  /** 无双 — how many cards does a demand raised BY `owner` require? (§5) */
  demandCount(G: GState, owner: PlayerId, kind: string, current: number): number;
  /** 方天画戟 (3.6) — max targets for `effectKey`. */
  targetLimit(G: GState, owner: PlayerId, effectKey: string, current: number): number;
}

/**
 * The four folds that CANNOT ask (§4): they are chained arithmetic the engine
 * performs mid-validation, so a non-locked (optional) handler would have to stop
 * and prompt, which a fold cannot do.
 *
 * An optional skill that *modifies* one of these therefore SPLITS IN TWO: the
 * choice is a trigger that writes a `{t:'flag'}`, and the effect is a locked
 * query that reads the flag. 裸衣 is the worked example (§11). This is the
 * pattern for every future "you may choose to do X, and then Y is different all
 * turn" — do not add an "optional query" instead.
 */
export const LOCKED_ONLY_QUERIES = [
  'strikeLimit',
  'drawCount',
  'demandCount',
  'targetLimit',
] as const satisfies readonly (keyof QueryHandlers)[];

/**
 * One contributor to the fold: a skill, or a piece of equipment (3.6). Ordered
 * by the §3.2 priority bands — equipment before skills — so stacking two
 * modifiers of the same kind is *defined* rather than incidental.
 */
export interface QueryProvider {
  /** For error messages and the locked-only assertion. */
  id: string;
  priority: number;
  /** 锁定技. Enforced at boot by assertQueryProvider (§4). */
  locked: boolean;
  handlers: Partial<QueryHandlers>;
}

/**
 * Derive, never subscribe — the same rule the trigger fan-out lives by
 * (engine-design §4 decision 1). Providers are re-read from live state on every
 * single query: a weapon that answers `strikeLimit` stops answering the instant
 * it is stolen, and no cache anywhere has to be told.
 */
export interface QuerySource {
  name: string;
  providersFor(G: GState, owner: PlayerId): readonly QueryProvider[];
}

/**
 * Fails at server boot, not in a playtest (§4's own instruction). A non-locked
 * skill that answers one of the four un-askable folds is a design error in the
 * skill, and the split above is the fix.
 */
export function assertQueryProvider(provider: QueryProvider): QueryProvider {
  if (provider.locked) return provider;
  for (const key of LOCKED_ONLY_QUERIES) {
    if (provider.handlers[key]) {
      throw new Error(
        `Query provider '${provider.id}' is not locked (锁定技) but answers '${key}', which the ` +
          `engine folds synchronously and cannot stop to ask about ` +
          `(docs/skill-trigger-design.md §4). Split it: an optional TRIGGER makes the choice and ` +
          `writes a {t:'flag'}; a LOCKED query reads that flag. See 裸衣 (§11).`,
      );
    }
  }
  return provider;
}
