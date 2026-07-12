// 南蛮入侵 (task 3.4). `nullify: 'per_target'` means pump.ts calls resolve()
// once per target with a single-element `targets` array — this file only
// ever has to reason about one target at a time (see the effect's header).

import { describe, it, expect } from 'vitest';
import { barbarianInvasion } from '../../src/content/effects/barbarianInvasion.js';
import { makeGState } from '../engine/fixtures.js';

const ctx = { source: '0', cards: ['barbarian_7c'], targets: ['1'] };

describe('barbarianInvasion.targeting', () => {
  it('hits any number of other players, self forbidden, per_target nullify', () => {
    expect(barbarianInvasion.targeting).toEqual({ min: 1, max: 'all_others', self: 'forbidden' });
    expect(barbarianInvasion.nullify).toBe('per_target');
  });
});

describe('barbarianInvasion.resolve', () => {
  it('first call demands the target strike, subject is the source', () => {
    const frames = barbarianInvasion.resolve(makeGState(), ctx);
    expect(frames).toEqual([
      { t: 'log', key: 'log.plays_at', params: { player: '0', card: 'barbarian_7c', target: '1' } },
      {
        t: 'demand',
        kind: 'strike',
        from: '1',
        by: '0',
        count: 1,
        reasonKey: 'demand.strike_barbarian',
        subject: '0',
      },
      { t: 'resume', effectKey: 'barbarian_invasion', ctx: { ...ctx, asked: true } },
    ]);
  });

  it('no 杀 supplied ⇒ 1 damage from the source to the target', () => {
    const frames = barbarianInvasion.resolve(makeGState(), { ...ctx, asked: true, supplied: null });
    expect(frames).toEqual([
      { t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal' },
      { t: 'log', key: 'log.damage', params: { target: '1', n: 1, source: '0' } },
    ]);
  });

  it('a 杀 supplied ⇒ just logs the response, no damage', () => {
    const frames = barbarianInvasion.resolve(makeGState(), {
      ...ctx,
      asked: true,
      supplied: ['strike_2c'],
    });
    expect(frames).toEqual([
      { t: 'log', key: 'log.responds', params: { player: '1', card: 'strike_2c' } },
    ]);
  });
});
