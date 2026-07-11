// Registry dispatch types (docs/engine-design.md §3). Content is data; the
// engine is generic — each card's `effectKey` (content/standard/cards.json,
// task 2.2a) looks up one of these in effectRegistry.ts.
//
// Layout note: engine-design §8 describes `content/` as a folder that
// "re-exports registries from /content/standard". The repo-root
// `content/standard/` holds *data* (cards.json, generals.json) — the single
// source of truth referenced throughout the docs and tests. The *code* that
// interprets that data (this file, effects/*.ts) lives under
// `server/src/content/` instead of the repo root: putting compiled TS here
// avoids the same rootDir:"./src" problem that `shared/` was built to solve
// for JSON (engine-design §8's "workspace fix"), without needing a second
// workspace just for server-only, server-authoritative game logic that the
// client has no reason to import.

import type { GState, PlayerId } from '../engine/state.js';
import type { EffectCtx, Frame } from '../engine/frames.js';

export interface TargetSpec {
  min: number;
  max: number | 'all_others' | 'all';
  self: 'allowed' | 'forbidden' | 'only';
  /** 杀 uses attack range; 顺手牵羊 uses distance ≤ 1 (task 3.x). */
  inRange?: 'attack' | 'distance_1';
  predicate?: (G: GState, self: PlayerId, candidate: PlayerId) => boolean;
}

/**
 * How a card play is wrapped in 无懈可击 windows
 * (docs/judgement-nullification-design.md §2.2). Read by pump.ts's 'play'
 * case; defaults to 'once' for `type: 'trick'` cards and 'none' for everything
 * else, so most effects never set it.
 *
 *  'none'       — dispatch straight through (杀/闪/桃, all equipment)
 *  'once'       — one window around the whole effect (无中生有, 决斗, 顺手牵羊…)
 *  'per_target' — one INDEPENDENT window per target (南蛮入侵, 万箭齐发, 桃园结义):
 *                 a 无懈可击 cancels "一张锦囊牌对一名角色产生的效果" — one target's
 *                 slice — so the other targets still have to answer
 *  'custom'     — the effect wraps its own frames; pump doesn't touch it.
 *                 五谷丰登 only (its reveal happens once, not per target)
 */
export type NullifyMode = 'none' | 'once' | 'per_target' | 'custom';

export interface CardEffect {
  key: string;
  targeting: TargetSpec;
  /** See NullifyMode. Omit unless the default is wrong. */
  nullify?: NullifyMode;
  /** Rule eligibility, not card possession — e.g. 桃: only when hp < maxHp;
   * 杀: strikesPlayed < strikeLimit. Whether the player actually holds the
   * card is the move's job to check (server/src/bgio/game.ts). */
  canPlay(G: GState, self: PlayerId): boolean;
  /**
   * Returns the frames this step of the effect produces, in **narrative
   * order** — frames[0] is conceptually "what happens first". The pump
   * (engine/pump.ts's `pushFrames`) pushes them onto the LIFO stack in
   * reverse so frames[0] ends up on top and pops first. This is what lets
   * an effect return `[request, resume]` and have the request actually
   * block *before* the resume frame becomes reachable.
   *
   * Never mutates G directly (docs/engine-design.md §2) — this is also
   * what makes an effect trivially unit-testable: call it, assert on the
   * returned array.
   */
  resolve(G: GState, ctx: EffectCtx): Frame[];
}

export type EffectRegistry = Record<string, CardEffect>;
