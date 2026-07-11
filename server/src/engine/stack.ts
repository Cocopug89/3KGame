// The two stack primitives, split out of pump.ts so phases.ts can push frames
// in narrative order without importing the pump (which imports phases.ts —
// a value cycle that works in practice and is a trap in principle).
//
// This module must not import boardgame.io — see docs/engine-design.md §8.

import type { GState } from './state.js';
import type { Frame } from './frames.js';

/**
 * Pushes `frames` onto the stack so that `frames[0]` — the *first* thing that
 * should conceptually happen — ends up on top and pops first. `resolve()` (a
 * CardEffect's or a SkillTrigger's) returns frames in that narrative order;
 * this is the one place that translates it into correct LIFO push order.
 */
export function pushFrames(G: GState, frames: readonly Frame[]): void {
  for (let i = frames.length - 1; i >= 0; i--) {
    G.stack.push(frames[i]);
  }
}

/**
 * Writes a player's answer into the ctx of the 'resume' frame currently on top
 * of the stack — docs/engine-design.md §2's "writes it into the resume frame's
 * ctx". Moves (server/src/bgio/game.ts) and {t:'demandClose'} call this, then
 * clear G.pending, then pump() again — never mutate G.stack directly.
 */
export function applyToResumeFrame(G: GState, patch: Record<string, unknown>): void {
  const top = G.stack[G.stack.length - 1];
  if (!top || top.t !== 'resume') {
    throw new Error(
      `applyToResumeFrame: expected a 'resume' frame on top of the stack, found '${top?.t ?? '(empty stack)'}'`,
    );
  }
  top.ctx = { ...top.ctx, ...patch };
}
