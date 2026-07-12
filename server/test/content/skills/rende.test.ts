// 仁德 (4.4 / Batch C) — give any number of hand cards to another player; the
// first time you have given two or more in a turn, heal 1. Task 4.5.
//
// Repeatable (no activeLimit), so the running total and the once-per-turn heal
// both live in turnFlags — which is what {t:'flag'} exists for (§2.2).

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { rende } from '../../../src/content/skills/rende.js';

function state(hand: string[], flags: Record<string, unknown> = {}) {
  return makeGState({
    players: { '0': makePlayer('0', { hand }), '1': makePlayer('1') },
    turnFlags: { strikesPlayed: 0, strikeLimit: 1, ...flags } as never,
  });
}

describe('rende — giving', () => {
  it('gives the card and counts it, with no heal below the threshold', () => {
    expect(
      rende.active!.resolve(state(['strike_2c']), { source: '0', targets: ['1'], cards: ['strike_2c'] }),
    ).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'hand', player: '0' }, to: { z: 'hand', player: '1' }, by: '0' },
      { t: 'flag', key: 'rende.given', value: 1 },
    ]);
  });

  it('heals exactly once, on the invocation that takes the running total to two', () => {
    expect(
      rende.active!.resolve(state(['strike_2c', 'peach_3h'], { 'rende.given': 1 }), {
        source: '0',
        targets: ['1'],
        cards: ['strike_2c'],
      }),
    ).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'hand', player: '0' }, to: { z: 'hand', player: '1' }, by: '0' },
      { t: 'flag', key: 'rende.given', value: 2 },
      { t: 'flag', key: 'rende.healed', value: true },
      { t: 'heal', target: '0', amount: 1, source: '0' },
    ]);
  });

  it('does not heal a second time once it has healed this turn', () => {
    const frames = rende.active!.resolve(
      state(['strike_2c'], { 'rende.given': 3, 'rende.healed': true }),
      { source: '0', targets: ['1'], cards: ['strike_2c'] },
    );
    expect(frames.some((f) => f.t === 'heal')).toBe(false);
  });

  it('is repeatable — no activeLimit, unlike 制衡/青囊', () => {
    expect(rende.activeLimit).toBeUndefined();
  });
});
