// 诸葛连弩 (task 3.6) — a pure strikeLimit query, 锁定技: unconditionally
// Infinity whenever it is asked. No trigger half at all.

import { describe, it, expect } from 'vitest';
import { zhugeCrossbowQuery } from '../../src/content/effects/zhugeCrossbow.js';
import { makeGState } from '../engine/fixtures.js';

describe('zhugeCrossbowQuery.strikeLimit', () => {
  it('is always Infinity, regardless of the running limit passed in', () => {
    const G = makeGState();
    expect(zhugeCrossbowQuery.strikeLimit!(G, '0', 0)).toBe(Infinity);
    expect(zhugeCrossbowQuery.strikeLimit!(G, '0', 5)).toBe(Infinity);
  });

  it('answers no other query — it is a single-purpose handler', () => {
    expect(zhugeCrossbowQuery.cardsAs).toBeUndefined();
    expect(zhugeCrossbowQuery.targetLimit).toBeUndefined();
  });
});
