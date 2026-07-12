// 制衡 (4.3 / Batch B) — once per turn: discard any number of cards, draw that
// many. Task 4.5. An ACTIVE skill (§1's third face) — resolve() pays its own
// cost, because useSkill validates but does not discard.

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { zhiheng } from '../../../src/content/skills/zhiheng.js';

const active = zhiheng.active!;

function state() {
  return makeGState({
    players: { '0': makePlayer('0', { hand: ['strike_2c', 'peach_3h', 'dodge_2h1'] }), '1': makePlayer('1') },
  });
}

describe('zhiheng — discard N, draw N', () => {
  it('discards the named cards itself and draws the same number', () => {
    expect(active.resolve(state(), { source: '0', targets: [], cards: ['strike_2c', 'peach_3h'] })).toEqual([
      {
        t: 'moveCards',
        cards: ['strike_2c', 'peach_3h'],
        from: { z: 'hand', player: '0' },
        to: { z: 'discard' },
        by: '0',
      },
      { t: 'draw', player: '0', count: 2 },
    ]);
  });

  it('zero cards is legal — "任意张" includes none, and the draw is then zero too', () => {
    expect(active.resolve(state(), { source: '0', targets: [], cards: [] })).toEqual([
      { t: 'draw', player: '0', count: 0 },
    ]);
  });

  it('targets nobody, and is always playable', () => {
    expect(active.targeting).toEqual({ min: 0, max: 0, self: 'only' });
    expect(active.canPlay(state(), '0')).toBe(true);
  });

  it('is once per turn — engine-enforced, never re-implemented in the skill (§3.5)', () => {
    expect(zhiheng.activeLimit).toBe('once_per_turn');
  });
});
