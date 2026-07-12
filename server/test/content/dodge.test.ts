import { describe, it, expect } from 'vitest';
import { dodge } from '../../src/content/effects/dodge.js';
import { makeGState } from '../engine/fixtures.js';

describe('dodge', () => {
  it('canPlay is always FALSE — 闪 is purely reactive, never an action-phase play (7.2)', () => {
    const G = makeGState();
    expect(dodge.canPlay(G, '0')).toBe(false);
  });

  it('resolve() is a documented no-op — strike\'s own resolve() handles the actual outcome', () => {
    const G = makeGState();
    expect(dodge.resolve(G, {})).toEqual([]);
  });

  it('targets only self, with no explicit target selection', () => {
    expect(dodge.targeting).toEqual({ min: 0, max: 0, self: 'only' });
  });
});
