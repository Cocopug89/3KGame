// 桃园结义 (task 3.4). The one AoE with `self: 'allowed'`/`max: 'all'` — every
// player, including the source, heals unconditionally per target (no demand,
// nothing to dodge), so `nullify: 'per_target'` only ever guards ONE heal.

import { describe, it, expect } from 'vitest';
import { peachGarden } from '../../src/content/effects/peachGarden.js';
import { makeGState } from '../engine/fixtures.js';

describe('peachGarden.targeting', () => {
  it('targets everyone including self, per_target nullify', () => {
    expect(peachGarden.targeting).toEqual({ min: 1, max: 'all', self: 'allowed' });
    expect(peachGarden.nullify).toBe('per_target');
  });

  it('canPlay is always true', () => {
    expect(peachGarden.canPlay(makeGState(), '0')).toBe(true);
  });
});

describe('peachGarden.resolve', () => {
  it('heals the (single, per-target-call) target by 1 and logs both the play and the heal', () => {
    const frames = peachGarden.resolve(makeGState(), {
      source: '0',
      cards: ['peach_garden_ah'],
      targets: ['1'],
    });
    expect(frames).toEqual([
      { t: 'log', key: 'log.plays_at', params: { player: '0', card: 'peach_garden_ah', target: '1' } },
      { t: 'heal', target: '1', amount: 1 },
      { t: 'log', key: 'log.heal', params: { target: '1', n: 1 } },
    ]);
  });

  it('the source can be their own target (self: allowed) — same one-target-per-call shape', () => {
    const frames = peachGarden.resolve(makeGState(), {
      source: '0',
      cards: ['peach_garden_ah'],
      targets: ['0'],
    });
    expect(frames).toEqual([
      { t: 'log', key: 'log.plays_at', params: { player: '0', card: 'peach_garden_ah', target: '0' } },
      { t: 'heal', target: '0', amount: 1 },
      { t: 'log', key: 'log.heal', params: { target: '0', n: 1 } },
    ]);
  });
});
