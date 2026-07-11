// 顺手牵羊 (task 3.3). Shares takeOneCard.ts with 过河拆桥 — which is exactly
// why these tests are worth writing separately: they pin the two things that
// differ (distance ≤ 1, and the card lands in the thief's HAND) so that a
// refactor of the shared body can't quietly collapse the two cards into one.

import { describe, it, expect } from 'vitest';
import { steal } from '../../src/content/effects/steal.js';
import { makeGState, makePlayer } from '../engine/fixtures.js';
import type { GState } from '../../src/engine/state.js';

function victimState(): GState {
  return makeGState({
    players: {
      '0': makePlayer('0'),
      '1': makePlayer('1', {
        hand: ['strike_2c'],
        equipment: { weapon: 'zhuge_crossbow_ac', armour: null, plusHorse: null, minusHorse: null },
      }),
    },
    seats: ['0', '1'],
  });
}

const ctx = { source: '0', cards: ['steal_3s'], targets: ['1'] };

describe('steal.resolve', () => {
  it('asks the source to choose, hand cards as opaque slots', () => {
    const frames = steal.resolve(victimState(), ctx);
    expect(frames).toEqual([
      {
        t: 'request',
        req: {
          kind: 'chooseCard',
          playerId: '0',
          target: '1',
          reasonKey: 'choose.steal',
          choices: [
            { z: 'hand', index: 0 },
            { z: 'equip', cardId: 'zhuge_crossbow_ac' },
          ],
        },
      },
      { t: 'resume', effectKey: 'steal', ctx: { ...ctx, asked: true } },
    ]);
    expect(JSON.stringify(frames[0])).not.toContain('strike_2c');
  });

  it("puts the card in the THIEF'S hand — not the discard pile", () => {
    const frames = steal.resolve(victimState(), {
      ...ctx,
      asked: true,
      chosen: 'strike_2c',
      chosenZone: { z: 'hand', player: '1' },
    });
    expect(frames).toEqual([
      {
        t: 'moveCards',
        cards: ['strike_2c'],
        from: { z: 'hand', player: '1' },
        to: { z: 'hand', player: '0' },
        by: '0',
      },
    ]);
  });

  it('steals equipment into the hand as an ordinary card, NOT onto the thief', () => {
    const frames = steal.resolve(victimState(), {
      ...ctx,
      asked: true,
      chosen: 'zhuge_crossbow_ac',
      chosenZone: { z: 'equip', player: '1' },
    });
    // to: {z:'hand'} — a moveCards to {z:'equip'} would have re-equipped it,
    // which is the bug this test exists to catch.
    expect(frames).toEqual([
      {
        t: 'moveCards',
        cards: ['zhuge_crossbow_ac'],
        from: { z: 'equip', player: '1' },
        to: { z: 'hand', player: '0' },
        by: '0',
      },
    ]);
  });

  it('fizzles if the victim died or emptied out while the chain argued', () => {
    const dead = victimState();
    dead.players['1'].alive = false;
    expect(steal.resolve(dead, ctx)).toEqual([]);

    const empty = victimState();
    empty.players['1'].hand = [];
    empty.players['1'].equipment = { weapon: null, armour: null, plusHorse: null, minusHorse: null };
    expect(steal.resolve(empty, ctx)).toEqual([]);
  });
});

describe('steal.targeting', () => {
  it('is distance ≤ 1 — the one rules difference from 过河拆桥', () => {
    expect(steal.targeting.inRange).toBe('distance_1');
    expect(steal.targeting.self).toBe('forbidden');
    expect(steal.targeting.min).toBe(1);
    expect(steal.targeting.max).toBe(1);
  });

  it('excludes a player with nothing to steal', () => {
    const G = victimState();
    expect(steal.targeting.predicate!(G, '0', '1')).toBe(true);
    G.players['1'].hand = [];
    G.players['1'].equipment = { weapon: null, armour: null, plusHorse: null, minusHorse: null };
    expect(steal.targeting.predicate!(G, '0', '1')).toBe(false);
  });
});
