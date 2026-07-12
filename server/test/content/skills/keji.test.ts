// 克己 (4.2 / Batch A) — skip the discard phase if no 杀 was used OR PLAYED in
// the action phase. Task 4.5.
//
// ⚠️ The counter is `turnFlags.strikeUsedInAction`, NOT `strikesPlayed`
// (skill-trigger-design §2.2, and CONTINUE.md's own warning on this row): a 杀
// supplied in RESPONSE to a 决斗 during your action phase counts too, and
// `strikesPlayed` never sees it. These tests pin the flag the skill actually
// reads — a future refactor that "simplifies" this back to strikesPlayed
// should fail here.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { keji } from '../../../src/content/skills/keji.js';

const trigger = keji.triggers![0];

function state(flags: Record<string, unknown> = {}) {
  return makeGState({
    turnFlags: { strikesPlayed: 0, strikeLimit: 1, ...flags } as never,
  });
}

describe('keji — phase.end of the ACTION phase', () => {
  it('fires when no 杀 was used or played this action phase', () => {
    const G = state();
    expect(trigger.when({ event: 'phase.end', phase: 'action', player: '0' }, G, '0')).toBe(true);
  });

  it('does NOT fire once strikeUsedInAction is set', () => {
    const G = state({ strikeUsedInAction: true });
    expect(trigger.when({ event: 'phase.end', phase: 'action', player: '0' }, G, '0')).toBe(false);
  });

  it('reads strikeUsedInAction, not strikesPlayed — a 杀 played in response still blocks it', () => {
    // The wedge case: strikesPlayed is 0 (nothing was PLAYED from the action
    // phase's own act loop) but a 杀 was SUPPLIED to a 决斗 mid-phase.
    const G = state({ strikesPlayed: 0, strikeUsedInAction: true });
    expect(trigger.when({ event: 'phase.end', phase: 'action', player: '0' }, G, '0')).toBe(false);

    // ...and the mirror: strikesPlayed non-zero is NOT by itself what stops it.
    const G2 = state({ strikesPlayed: 2 });
    expect(trigger.when({ event: 'phase.end', phase: 'action', player: '0' }, G2, '0')).toBe(true);
  });

  it('does not fire on another player\'s action phase, or on any other phase', () => {
    const G = state();
    expect(trigger.when({ event: 'phase.end', phase: 'action', player: '1' }, G, '0')).toBe(false);
    expect(trigger.when({ event: 'phase.end', phase: 'draw', player: '0' }, G, '0')).toBe(false);
    expect(trigger.when({ event: 'phase.start', phase: 'action', player: '0' }, G, '0')).toBe(false);
  });

  it('skips the discard phase', () => {
    const G = state();
    expect(trigger.effect({ event: 'phase.end', phase: 'action', player: '0' }, G, '0')).toEqual([
      { t: 'skipPhase', phase: 'discard' },
    ]);
  });

  it('is optional', () => {
    expect(trigger.optional).toBe(true);
  });
});
