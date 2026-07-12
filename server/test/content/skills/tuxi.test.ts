// 突袭 (4.3 / Batch B) — skip your draw phase, take one card each from up to
// two other players instead. Task 4.5.
//
// A REPLACEMENT trigger: {t:'skipPhase'} pushed from inside the draw phase's
// own phase.start, which is why a phase is [phase.start, phaseBody] (§2.2).

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { tuxi, tuxiSteal } from '../../../src/content/skills/tuxi.js';

const trigger = tuxi.triggers![0];

/** 0 = 张辽; 1 has a hand; 2 has equipment; 3 is empty. */
function state() {
  return makeGState({
    players: {
      '0': makePlayer('0'),
      '1': makePlayer('1', { hand: ['strike_2c'] }),
      '2': makePlayer('2', {
        equipment: { weapon: 'zhuge_crossbow_1c', armour: null, plusHorse: null, minusHorse: null },
      }),
      '3': makePlayer('3'),
    },
    seats: ['0', '1', '2', '3'],
  });
}

describe('tuxi — the draw-phase replacement trigger', () => {
  it('fires at the start of the owner\'s DRAW phase when somebody has something to take', () => {
    expect(trigger.when({ event: 'phase.start', phase: 'draw', player: '0' }, state(), '0')).toBe(true);
  });

  it('does not fire in another phase, on another player\'s turn, or when everyone is empty', () => {
    const G = state();
    expect(trigger.when({ event: 'phase.start', phase: 'action', player: '0' }, G, '0')).toBe(false);
    expect(trigger.when({ event: 'phase.start', phase: 'draw', player: '1' }, G, '0')).toBe(false);

    const empty = makeGState({ players: { '0': makePlayer('0'), '1': makePlayer('1') } });
    expect(trigger.when({ event: 'phase.start', phase: 'draw', player: '0' }, empty, '0')).toBe(false);
  });

  it('skips the draw it is standing in, then enters the steal loop with two picks', () => {
    expect(trigger.effect({ event: 'phase.start', phase: 'draw', player: '0' }, state(), '0')).toEqual([
      { t: 'skipPhase', phase: 'draw' },
      { t: 'effect', effectKey: 'tuxi_steal', ctx: { owner: '0', remaining: 2 } },
    ]);
  });
});

describe('tuxi_steal — the pick-a-player / pick-a-card loop', () => {
  it('first entry asks WHICH player, offering only those with something to lose', () => {
    expect(tuxiSteal.resolve(state(), { owner: '0', remaining: 2 })).toEqual([
      {
        t: 'request',
        req: { kind: 'choosePlayer', playerId: '0', reasonKey: 'choose.tuxi', candidates: ['1', '2'] },
      },
      { t: 'resume', effectKey: 'tuxi_steal', ctx: { owner: '0', remaining: 2 } },
    ]);
  });

  it('then asks WHICH card of theirs — by slot for a hand, by id for equipment', () => {
    expect(tuxiSteal.resolve(state(), { owner: '0', remaining: 2, chosenPlayer: '2' })).toEqual([
      {
        t: 'request',
        req: {
          kind: 'chooseCard',
          playerId: '0',
          target: '2',
          reasonKey: 'choose.tuxi_take',
          choices: [{ z: 'equip', cardId: 'zhuge_crossbow_1c' }],
        },
      },
      {
        t: 'resume',
        effectKey: 'tuxi_steal',
        ctx: { owner: '0', remaining: 2, awaitingCard: true, pickFrom: '2' },
      },
    ]);
  });

  it('takes the card, then comes back round for the second pick with remaining−1', () => {
    const frames = tuxiSteal.resolve(state(), {
      owner: '0',
      remaining: 2,
      awaitingCard: true,
      pickFrom: '1',
      chosen: 'strike_2c',
      chosenZone: { z: 'hand', player: '1' },
    });
    expect(frames[0]).toEqual({
      t: 'moveCards',
      cards: ['strike_2c'],
      from: { z: 'hand', player: '1' },
      to: { z: 'hand', player: '0' },
      by: '0',
    });
    // 5.4: the public log must NOT name a card taken out of a hidden hand.
    expect(frames[1]).toEqual({ t: 'log', key: 'log.card_taken_hidden', params: { player: '0', target: '1' } });
    expect(JSON.stringify(frames[1])).not.toContain('strike_2c');
    expect(frames[3]).toEqual({ t: 'resume', effectKey: 'tuxi_steal', ctx: { owner: '0', remaining: 1 } });
  });

  it('names the card when it came from the equipment zone — that one was face up', () => {
    const frames = tuxiSteal.resolve(state(), {
      owner: '0',
      remaining: 2,
      awaitingCard: true,
      pickFrom: '2',
      chosen: 'zhuge_crossbow_1c',
      chosenZone: { z: 'equip', player: '2' },
    });
    expect(frames[1]).toEqual({
      t: 'log',
      key: 'log.card_taken',
      params: { player: '0', target: '2', card: 'zhuge_crossbow_1c' },
    });
  });

  it('"up to two" — declining the player prompt stops the loop', () => {
    expect(tuxiSteal.resolve(state(), { owner: '0', remaining: 2, chosenPlayer: null })).toEqual([]);
  });

  it('stops when the second pick is spent, and never offers the owner themselves', () => {
    const frames = tuxiSteal.resolve(state(), {
      owner: '0',
      remaining: 1,
      awaitingCard: true,
      pickFrom: '1',
      chosen: 'strike_2c',
      chosenZone: { z: 'hand', player: '1' },
    });
    expect(frames.some((f) => f.t === 'request')).toBe(false);
  });

  it('re-asks rather than crashing if the chosen player emptied out or died since being offered', () => {
    const G = state();
    G.players['1'].hand = [];
    const frames = tuxiSteal.resolve(G, { owner: '0', remaining: 2, chosenPlayer: '1' });
    expect(frames[0]).toEqual({
      t: 'request',
      req: { kind: 'choosePlayer', playerId: '0', reasonKey: 'choose.tuxi', candidates: ['2'] },
    });
  });
});
