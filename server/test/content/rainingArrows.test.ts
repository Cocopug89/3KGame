// 万箭齐发 (task 3.4). Same shape as barbarianInvasion.ts, except the demand
// is for a 闪, not a 杀 — see that file's tests for the shared per_target
// nullify reasoning.

import { describe, it, expect } from 'vitest';
import { rainingArrows } from '../../src/content/effects/rainingArrows.js';
import { makeGState } from '../engine/fixtures.js';

const ctx = { source: '0', cards: ['raining_arrows_ah'], targets: ['1'] };

describe('rainingArrows.targeting', () => {
  it('hits any number of other players, self forbidden, per_target nullify', () => {
    expect(rainingArrows.targeting).toEqual({ min: 1, max: 'all_others', self: 'forbidden' });
    expect(rainingArrows.nullify).toBe('per_target');
  });
});

describe('rainingArrows.resolve', () => {
  it('first call demands a 闪 from the target, subject is the source', () => {
    const frames = rainingArrows.resolve(makeGState(), ctx);
    expect(frames).toEqual([
      { t: 'log', key: 'log.plays_at', params: { player: '0', card: 'raining_arrows_ah', target: '1' } },
      {
        t: 'demand',
        kind: 'dodge',
        from: '1',
        by: '0',
        count: 1,
        reasonKey: 'demand.dodge_arrows',
        subject: '0',
      },
      { t: 'resume', effectKey: 'raining_arrows', ctx: { ...ctx, asked: true } },
    ]);
  });

  it('no 闪 supplied ⇒ 1 damage from the source to the target', () => {
    const frames = rainingArrows.resolve(makeGState(), { ...ctx, asked: true, supplied: null });
    expect(frames).toEqual([
      { t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal' },
      { t: 'log', key: 'log.damage', params: { target: '1', n: 1, source: '0' } },
    ]);
  });

  it('a 闪 supplied ⇒ just logs the response, no damage', () => {
    const frames = rainingArrows.resolve(makeGState(), {
      ...ctx,
      asked: true,
      supplied: ['dodge_2h1'],
    });
    expect(frames).toEqual([
      { t: 'log', key: 'log.responds', params: { player: '1', card: 'dodge_2h1' } },
    ]);
  });

  it('a DEEMED 闪 (supplied: [], e.g. 八卦阵) does not throw, but logs an undefined card — a gap, not a crash', () => {
    // 八卦阵's demand.open listener fires on `kind === 'dodge'` regardless of
    // reasonKey, so it can deem THIS demand too, not just strike.ts's own.
    // rainingArrows.ts (unlike duress.ts) does not check `supplied.length`, so
    // an empty deemed answer still falls into the "responded" branch and reads
    // `supplied[0]` — undefined, not a throw. Documented here rather than
    // silently assumed correct: the log line ends up with an undefined card.
    const frames = rainingArrows.resolve(makeGState(), { ...ctx, asked: true, supplied: [] });
    expect(frames).toEqual([
      { t: 'log', key: 'log.responds', params: { player: '1', card: undefined } },
    ]);
  });
});
