// 空城 (4.2 / Batch A) — with an empty hand you cannot be targeted by 杀 or 决斗.
// Task 4.5.

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';

import { kongcheng } from '../../../src/content/skills/kongcheng.js';

function state(hand: string[]) {
  return makeGState({
    players: { '0': makePlayer('0', { hand }), '1': makePlayer('1') },
  });
}

describe('kongcheng.targetable — empty hand ⇒ untargetable by 杀/决斗', () => {
  it('blocks strike and duel while the hand is empty', () => {
    const G = state([]);
    expect(kongcheng.queries!.targetable!(G, '0', '1', 'strike')).toBe(false);
    expect(kongcheng.queries!.targetable!(G, '0', '1', 'duel')).toBe(false);
  });

  it('allows them again the moment a single card is held', () => {
    const G = state(['strike_2c']);
    expect(kongcheng.queries!.targetable!(G, '0', '1', 'strike')).toBe(true);
    expect(kongcheng.queries!.targetable!(G, '0', '1', 'duel')).toBe(true);
  });

  it('never blocks anything else — 顺手牵羊/乐不思蜀 still reach an empty-handed 诸葛亮', () => {
    const G = state([]);
    expect(kongcheng.queries!.targetable!(G, '0', '1', 'steal')).toBe(true);
    expect(kongcheng.queries!.targetable!(G, '0', '1', 'indulgence')).toBe(true);
    expect(kongcheng.queries!.targetable!(G, '0', '1', 'dismantle')).toBe(true);
  });

  it('is 锁定技 — targetable is AND-folded, a prohibition must not be optional (§4)', () => {
    expect(kongcheng.locked).toBe(true);
  });
});
