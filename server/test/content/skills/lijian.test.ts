// 离间 (4.4 / Batch C) — discard one card to make two other MALE characters
// duel each other. Task 4.5.
//
// The synthesized 决斗 bypasses {t:'play'} and goes straight to {t:'effect'} —
// so it is unnullifiable BY CONSTRUCTION (无懈可击 answers a played card; there
// is no played card here), which is the correct ruling and falls out of the
// frame choice rather than needing a special case.

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { lijian } from '../../../src/content/skills/lijian.js';

const active = lijian.active!;

function state() {
  return makeGState({
    players: {
      '0': makePlayer('0', { generalId: 'diao_chan', hand: ['strike_2c'] }),
      '1': makePlayer('1', { generalId: 'guan_yu' }), // male
      '2': makePlayer('2', { generalId: 'da_qiao' }), // female
      '3': makePlayer('3', { generalId: 'zhang_fei' }), // male
    },
    seats: ['0', '1', '2', '3'],
  });
}

describe('lijian.targeting — two OTHER males', () => {
  const G = state();

  it('accepts males', () => {
    expect(active.targeting.predicate!(G, '0', '1')).toBe(true);
    expect(active.targeting.predicate!(G, '0', '3')).toBe(true);
  });

  it('rejects females', () => {
    expect(active.targeting.predicate!(G, '0', '2')).toBe(false);
  });
});

describe('lijian — the duel it synthesizes', () => {
  it('discards the cost and pushes a duel between the two targets, first as the duel\'s source', () => {
    expect(active.resolve(state(), { source: '0', targets: ['1', '3'], cards: ['strike_2c'] })).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'hand', player: '0' }, to: { z: 'discard' }, by: '0' },
      { t: 'effect', effectKey: 'duel', ctx: { source: '1', targets: ['3'], cards: [] } },
    ]);
  });

  it('is an {t:\'effect\'}, never a {t:\'play\'} — that is what makes it unnullifiable', () => {
    const frames = active.resolve(state(), { source: '0', targets: ['1', '3'], cards: ['strike_2c'] });
    expect(frames.some((f) => f.t === 'play')).toBe(false);
  });

  it('costs exactly one card, once per turn', () => {
    expect(lijian.activeCardCount).toBe(1);
    expect(lijian.activeLimit).toBe('once_per_turn');
  });
});
