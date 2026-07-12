// 枭姬 (4.3 / Batch B) — draw 2 whenever you LOSE a piece of equipment. Task 4.5.
//
// "Lose" includes REPLACED, which is why 4.3 had to fix putInZone's equip-slot
// branch (pump.ts) to emit card.lost at all — 枭姬 is the first listener that
// ever needed to hear it. That fix is engine-side; what this file pins is that
// the skill listens to the `equip` zone and to nothing else.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { xiaoji } from '../../../src/content/skills/xiaoji.js';

const trigger = xiaoji.triggers![0];

const lost = (over: Record<string, unknown> = {}) =>
  ({ event: 'card.lost', player: '0', cards: ['zhuge_crossbow_1c'], from: 'equip', ...over }) as never;

describe('xiaoji — card.lost from the equipment zone', () => {
  const G = makeGState();

  it('fires when the owner loses equipment — stolen, destroyed, or replaced', () => {
    expect(trigger.when(lost(), G, '0')).toBe(true);
  });

  it('does not fire for a hand card or a judgement card', () => {
    expect(trigger.when(lost({ from: 'hand' }), G, '0')).toBe(false);
    expect(trigger.when(lost({ from: 'judgementZone' }), G, '0')).toBe(false);
  });

  it('does not fire when somebody ELSE loses equipment', () => {
    expect(trigger.when(lost({ player: '1' }), G, '0')).toBe(false);
  });

  it('does not care about hand size — unlike 连营, this is unconditional', () => {
    expect(trigger.when(lost(), G, '0')).toBe(true);
  });

  it('draws TWO', () => {
    expect(trigger.effect(lost(), G, '0')).toEqual([{ t: 'draw', player: '0', count: 2 }]);
    expect(trigger.optional).toBe(true);
  });
});
