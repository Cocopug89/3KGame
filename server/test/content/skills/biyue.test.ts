// 闭月 (4.2 / Batch A) — draw 1 at the start of the end phase. Task 4.5.
// The first of Batch A's two TRIGGER skills (the other ten are queries).

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { biyue } from '../../../src/content/skills/biyue.js';

const trigger = biyue.triggers![0];

describe('biyue — phase.start on the END phase', () => {
  const G = makeGState();

  it('fires at the start of the owner\'s own end phase', () => {
    expect(trigger.when({ event: 'phase.start', phase: 'end', player: '0' }, G, '0')).toBe(true);
  });

  it('does not fire in any other phase', () => {
    expect(trigger.when({ event: 'phase.start', phase: 'draw', player: '0' }, G, '0')).toBe(false);
    expect(trigger.when({ event: 'phase.start', phase: 'discard', player: '0' }, G, '0')).toBe(false);
    expect(trigger.when({ event: 'phase.start', phase: 'prep', player: '0' }, G, '0')).toBe(false);
  });

  it('does not fire on somebody else\'s end phase', () => {
    expect(trigger.when({ event: 'phase.start', phase: 'end', player: '1' }, G, '0')).toBe(false);
  });

  it('does not fire on phase.END of the end phase — it is a phase.start listener', () => {
    expect(trigger.when({ event: 'phase.end', phase: 'end', player: '0' }, G, '0')).toBe(false);
  });

  it('draws exactly one card', () => {
    expect(trigger.effect({ event: 'phase.start', phase: 'end', player: '0' }, G, '0')).toEqual([
      { t: 'draw', player: '0', count: 1 },
    ]);
  });

  it('is optional — 闭月 prompts, it is not 锁定技', () => {
    expect(trigger.optional).toBe(true);
    expect(trigger.event).toBe('phase.start');
  });
});
