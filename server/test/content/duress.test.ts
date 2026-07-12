// 借刀杀人 (task 3.4). targets[0] must hold a weapon and be in attack range of
// targets[1] — a PAIRWISE constraint re-checked at resolve() time (duress.ts's
// own header explains why TargetSpec.predicate can't express it). Two
// documented gaps this file also pins: an out-of-range/weapon-less pairing
// simply fizzles, and "once per action phase" is not enforced at all.

import { describe, it, expect } from 'vitest';
import { duress } from '../../src/content/effects/duress.js';
import { makeGState, makePlayer } from '../engine/fixtures.js';
import type { GState } from '../../src/engine/state.js';

function adjacentTable(): GState {
  return makeGState({
    players: {
      '0': makePlayer('0'),
      '1': makePlayer('1', {
        equipment: { weapon: 'zhuge_crossbow_ac', armour: null, plusHorse: null, minusHorse: null },
      }),
      '2': makePlayer('2'),
    },
    seats: ['0', '1', '2'],
  });
}

const ctx = { source: '0', cards: ['duress_qc'], targets: ['1', '2'] };

describe('duress.targeting', () => {
  it('takes exactly two targets, self allowed (targets[0] can be the player themselves in principle)', () => {
    expect(duress.targeting).toEqual({ min: 2, max: 2, self: 'allowed' });
  });
});

describe('duress.resolve — first call (not yet asked)', () => {
  it('demands targets[0] strike targets[1], subject is targets[1]', () => {
    const frames = duress.resolve(adjacentTable(), ctx);
    expect(frames).toEqual([
      { t: 'log', key: 'log.plays_at', params: { player: '0', card: 'duress_qc', target: '1' } },
      {
        t: 'demand',
        kind: 'strike',
        from: '1',
        by: '0',
        count: 1,
        reasonKey: 'demand.strike_duress',
        subject: '2',
      },
      { t: 'resume', effectKey: 'duress', ctx: { ...ctx, asked: true } },
    ]);
  });

  it('fizzles if targets[0] no longer holds a weapon (re-checked at resolve time)', () => {
    const G = adjacentTable();
    G.players['1'].equipment.weapon = null;
    expect(duress.resolve(G, ctx)).toEqual([]);
  });

  it('fizzles if targets[0] is dead', () => {
    const G = adjacentTable();
    G.players['1'].alive = false;
    expect(duress.resolve(G, ctx)).toEqual([]);
  });

  it('fizzles if targets[1] is out of targets[0]\'s attack range (weapon held, but range 1 vs distance 2)', () => {
    // Four seats, targets[0] two seats away from targets[1] — distance 2 with
    // a range-1 weapon equipped is still out of range.
    const G = makeGState({
      players: {
        '0': makePlayer('0'),
        '1': makePlayer('1', {
          equipment: { weapon: 'zhuge_crossbow_ac', armour: null, plusHorse: null, minusHorse: null },
        }),
        '2': makePlayer('2'),
        '3': makePlayer('3'),
      },
      seats: ['0', '1', '2', '3'],
    });
    expect(duress.resolve(G, { source: '0', cards: ['duress_qc'], targets: ['1', '3'] })).toEqual([]);
  });
});

describe('duress.resolve — resumed with an answer', () => {
  it('a real strike (supplied a card) plays a real {t:play} strike against targets[1]', () => {
    const frames = duress.resolve(adjacentTable(), {
      ...ctx,
      asked: true,
      supplied: ['strike_2c'],
    });
    expect(frames).toEqual([
      { t: 'log', key: 'log.responds', params: { player: '1', card: 'strike_2c' } },
      { t: 'play', source: '1', cards: ['strike_2c'], targets: ['2'], effectKey: 'strike' },
    ]);
  });

  it('an empty supplied array (0 cards) still counts — falls to the weapon-handover branch below', () => {
    // duress.ts checks `supplied.length > 0`, so [] does NOT count as a real
    // strike — unlike strike.ts's own demand, where [] is a valid dodge.
    const frames = duress.resolve(adjacentTable(), { ...ctx, asked: true, supplied: [] });
    expect(frames).toEqual([
      {
        t: 'moveCards',
        cards: ['zhuge_crossbow_ac'],
        from: { z: 'equip', player: '1' },
        to: { z: 'hand', player: '0' },
        by: '0',
      },
      { t: 'log', key: 'log.card_taken', params: { player: '0', target: '1', card: 'zhuge_crossbow_ac' } },
    ]);
  });

  it('refusing (supplied: null) hands the weapon to the source instead', () => {
    const frames = duress.resolve(adjacentTable(), { ...ctx, asked: true, supplied: null });
    expect(frames).toEqual([
      {
        t: 'moveCards',
        cards: ['zhuge_crossbow_ac'],
        from: { z: 'equip', player: '1' },
        to: { z: 'hand', player: '0' },
        by: '0',
      },
      { t: 'log', key: 'log.card_taken', params: { player: '0', target: '1', card: 'zhuge_crossbow_ac' } },
    ]);
  });

  it('refusing with no weapon left to hand over produces nothing (already gone)', () => {
    const G = adjacentTable();
    G.players['1'].equipment.weapon = null;
    expect(duress.resolve(G, { ...ctx, asked: true, supplied: null })).toEqual([]);
  });
});
