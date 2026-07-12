// 决斗 (task 3.4): a ping-pong `resume` loop, not recursion. `current`/`other`
// swap on every successful supply; the loop only ever ends when someone fails
// to supply a 杀 (one hit, no cumulative damage) — see duel.ts's own header.

import { describe, it, expect } from 'vitest';
import { duel } from '../../src/content/effects/duel.js';
import { makeGState } from '../engine/fixtures.js';

const ctx = { source: '0', cards: ['duel_ad'], targets: ['1'] };

describe('duel.targeting', () => {
  it('is exactly one other player, no range limit', () => {
    expect(duel.targeting).toEqual({ min: 1, max: 1, self: 'forbidden' });
  });

  it('canPlay is always true', () => {
    expect(duel.canPlay(makeGState(), '0')).toBe(true);
  });
});

describe('duel.resolve', () => {
  it('first call: the TARGET is demanded a 杀 first, and a resume records who owes what', () => {
    const frames = duel.resolve(makeGState(), ctx);
    expect(frames).toEqual([
      { t: 'log', key: 'log.plays_at', params: { player: '0', card: 'duel_ad', target: '1' } },
      {
        t: 'demand',
        kind: 'strike',
        from: '1',
        by: '0',
        count: 1,
        reasonKey: 'demand.strike_duel',
        subject: '0',
      },
      {
        t: 'resume',
        effectKey: 'duel',
        ctx: { ...ctx, asked: true, current: '1', other: '0' },
      },
    ]);
  });

  it('current fails to supply ⇒ ONE hit from other onto current, exchange ends', () => {
    const frames = duel.resolve(makeGState(), {
      ...ctx,
      asked: true,
      current: '1',
      other: '0',
      supplied: null,
    });
    expect(frames).toEqual([
      // `card` names the original 决斗 card (not whichever 杀 was last
      // exchanged) — 裸衣 needs to tell "this damage came from a 杀 or 决斗"
      // apart from card-less AoE damage. See duel.ts's own comment on this.
      { t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal', card: 'duel_ad' },
      { t: 'log', key: 'log.damage', params: { target: '1', n: 1, source: '0' } },
    ]);
  });

  it('current supplies a 杀 ⇒ the exchange FLIPS, other now owes one', () => {
    const frames = duel.resolve(makeGState(), {
      ...ctx,
      asked: true,
      current: '1',
      other: '0',
      supplied: ['duel_ac'],
    });
    expect(frames).toEqual([
      { t: 'log', key: 'log.responds', params: { player: '1', card: 'duel_ac' } },
      {
        t: 'demand',
        kind: 'strike',
        from: '0',
        by: '1',
        count: 1,
        reasonKey: 'demand.strike_duel',
        subject: '1',
      },
      {
        t: 'resume',
        effectKey: 'duel',
        ctx: { source: '0', targets: ['1'], cards: ['duel_ad'], asked: true, current: '0', other: '1' },
      },
    ]);
  });

  it('a losing exchange can backfire onto the turn player who played the card (F1 makes this safe)', () => {
    // '0' played the card, lost the ping-pong, and is now `current` — the
    // damage frame targets '0' itself. F1 (dying.ts) is what makes this not
    // wedge the turn loop; this test just pins that duel.ts produces the
    // frame honestly.
    const frames = duel.resolve(makeGState(), {
      source: '0',
      cards: ['duel_ad'],
      targets: ['1'],
      asked: true,
      current: '0',
      other: '1',
      supplied: null,
    });
    expect(frames).toEqual([
      { t: 'damage', source: '1', target: '0', amount: 1, kind: 'normal', card: 'duel_ad' },
      { t: 'log', key: 'log.damage', params: { target: '0', n: 1, source: '1' } },
    ]);
  });
});
