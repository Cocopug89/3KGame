// 反间 (4.4 / Batch C) — 周瑜 gives ONE OF HIS OWN cards to the target after
// they guess its suit; a wrong guess costs them 1 damage. Task 4.5.
//
// ⚠️ The DIRECTION was fixed in the Opus review: it is 周瑜's card that changes
// hands, not the target's. These tests pin the corrected direction — a
// regression back to "take a card from the target" fails here.

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { fanjian } from '../../../src/content/skills/fanjian.js';

const active = fanjian.active!;

function state(hand: string[] = ['strike_2c']) {
  return makeGState({
    players: { '0': makePlayer('0', { hand }), '1': makePlayer('1') },
  });
}

describe('fanjian — canPlay', () => {
  it('requires a card in the SOURCE\'s own hand', () => {
    expect(active.canPlay(state([]), '0')).toBe(false);
    expect(active.canPlay(state(), '0')).toBe(true);
  });
});

describe('fanjian — the three steps', () => {
  it('step 1 asks the TARGET to declare a suit', () => {
    expect(active.resolve(state(), { source: '0', targets: ['1'], cards: [] })).toEqual([
      { t: 'request', req: { kind: 'declareSuit', playerId: '1', reasonKey: 'skill.fanjian' } },
      { t: 'resume', effectKey: 'skill.fanjian', ctx: { source: '0', targets: ['1'], cards: [] } },
    ]);
  });

  it('step 2 asks the SOURCE to pick from THEIR OWN hand (target: source)', () => {
    expect(
      active.resolve(state(), { source: '0', targets: ['1'], cards: [], declaredSuit: 'hearts' }),
    ).toEqual([
      {
        t: 'request',
        req: {
          kind: 'chooseCard',
          playerId: '0',
          target: '0',
          reasonKey: 'skill.fanjian',
          choices: [{ z: 'hand', index: 0 }],
        },
      },
      {
        t: 'resume',
        effectKey: 'skill.fanjian',
        ctx: { source: '0', targets: ['1'], cards: [], declaredSuit: 'hearts', asked: true },
      },
    ]);
  });

  it('step 3 GIVES the chosen card to the target, and damages on a wrong guess', () => {
    expect(
      active.resolve(state(), {
        source: '0',
        targets: ['1'],
        cards: [],
        declaredSuit: 'hearts', // wrong — strike_2c is clubs
        asked: true,
        chosen: 'strike_2c',
        chosenZone: { z: 'hand', player: '0' },
      }),
    ).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'hand', player: '0' }, to: { z: 'hand', player: '1' }, by: '0' },
      { t: 'log', key: 'log.card_taken', params: { player: '1', card: 'strike_2c', target: '0' } },
      { t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal' },
      { t: 'log', key: 'log.damage', params: { target: '1', n: 1, source: '0' } },
    ]);
  });

  it('a correct guess still hands the card over — but costs nothing', () => {
    const frames = active.resolve(state(), {
      source: '0',
      targets: ['1'],
      cards: [],
      declaredSuit: 'clubs', // matches strike_2c
      asked: true,
      chosen: 'strike_2c',
      chosenZone: { z: 'hand', player: '0' },
    });
    expect(frames.some((f) => f.t === 'damage')).toBe(false);
    expect(frames[0]).toEqual({
      t: 'moveCards',
      cards: ['strike_2c'],
      from: { z: 'hand', player: '0' },
      to: { z: 'hand', player: '1' },
      by: '0',
    });
  });

  it('is once per turn', () => {
    expect(fanjian.activeLimit).toBe('once_per_turn');
  });
});
