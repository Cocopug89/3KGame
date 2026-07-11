// Unit tests for the pure/near-pure dying-window helpers (task 2.6). See
// engine/dying.ts's header comment for how these compose with pump.ts's
// 'dying' case and the bgio respondPeach move — this file only exercises
// the helpers in isolation, the way distance.test.ts does for distance.ts.

import { describe, it, expect } from 'vitest';
import { askerAtOffset, holdsPeach, resolveDeath } from '../../src/engine/dying.js';
import { makeGState, makePlayer } from './fixtures.js';
import type { GState } from '../../src/engine/state.js';

function fourPlayerState(overrides: Partial<GState> = {}): GState {
  return makeGState({
    players: {
      '0': makePlayer('0'),
      '1': makePlayer('1'),
      '2': makePlayer('2'),
      '3': makePlayer('3'),
    },
    seats: ['0', '1', '2', '3'],
    ...overrides,
  });
}

describe('askerAtOffset', () => {
  it('offset 0 is the dying player themselves', () => {
    const G = fourPlayerState();
    expect(askerAtOffset(G, '0', 0)).toBe('0');
  });

  it('walks clockwise through living seats for increasing offsets', () => {
    const G = fourPlayerState();
    expect(askerAtOffset(G, '0', 1)).toBe('1');
    expect(askerAtOffset(G, '0', 2)).toBe('2');
    expect(askerAtOffset(G, '0', 3)).toBe('3');
  });

  it('returns null once offset walks past every living player', () => {
    const G = fourPlayerState();
    expect(askerAtOffset(G, '0', 4)).toBeNull();
  });

  it('skips dead seats but still counts the dying player at offset 0', () => {
    const G = fourPlayerState();
    G.players['1'].alive = false;
    expect(askerAtOffset(G, '0', 0)).toBe('0');
    expect(askerAtOffset(G, '0', 1)).toBe('2'); // seat '1' skipped
    expect(askerAtOffset(G, '0', 2)).toBe('3');
    expect(askerAtOffset(G, '0', 3)).toBeNull(); // only 3 living players total
  });

  it('starts from a non-zero seat and wraps around correctly', () => {
    const G = fourPlayerState();
    expect(askerAtOffset(G, '2', 0)).toBe('2');
    expect(askerAtOffset(G, '2', 1)).toBe('3');
    expect(askerAtOffset(G, '2', 2)).toBe('0'); // wraps past the end of G.seats
    expect(askerAtOffset(G, '2', 3)).toBe('1');
  });

  it('throws for an unknown player', () => {
    const G = fourPlayerState();
    expect(() => askerAtOffset(G, 'nobody', 0)).toThrow();
  });
});

describe('holdsPeach', () => {
  it('is true when the player holds a card with effectKey peach', () => {
    const G = fourPlayerState();
    G.players['0'].hand = ['strike_2c', 'peach_3h'];
    expect(holdsPeach(G, '0')).toBe(true);
  });

  it('is false when the player holds no peach', () => {
    const G = fourPlayerState();
    G.players['0'].hand = ['strike_2c', 'dodge_2h1'];
    expect(holdsPeach(G, '0')).toBe(false);
  });

  it('is false for an empty hand', () => {
    const G = fourPlayerState();
    expect(holdsPeach(G, '0')).toBe(false);
  });

  it('is false for an unknown player rather than throwing', () => {
    const G = fourPlayerState();
    expect(holdsPeach(G, 'nobody')).toBe(false);
  });
});

describe('resolveDeath', () => {
  it('marks not alive, reveals role, and discards hand + equipment + judgement zone', () => {
    const G = fourPlayerState();
    const player = G.players['0'];
    player.hp = 0;
    player.roleRevealed = false;
    player.hand = ['strike_2c', 'dodge_2h1'];
    player.equipment = {
      weapon: 'green_dragon_blade_5s',
      armour: null,
      plusHorse: 'red_hare_5h',
      minusHorse: null,
    };
    player.judgementZone = ['some_delayed_trick'];

    resolveDeath(G, '0');

    expect(player.alive).toBe(false);
    expect(player.roleRevealed).toBe(true);
    expect(player.hand).toEqual([]);
    expect(player.judgementZone).toEqual([]);
    expect(player.equipment).toEqual({
      weapon: null,
      armour: null,
      plusHorse: null,
      minusHorse: null,
    });
    expect([...G.discardPile].sort()).toEqual(
      ['strike_2c', 'dodge_2h1', 'green_dragon_blade_5s', 'red_hare_5h', 'some_delayed_trick'].sort(),
    );
  });

  it('handles a player with no equipment/judgement cards without pushing nulls or empties', () => {
    const G = fourPlayerState();
    resolveDeath(G, '1');
    expect(G.discardPile).toEqual([]);
    expect(G.players['1'].alive).toBe(false);
  });

  it('throws for an unknown player', () => {
    const G = fourPlayerState();
    expect(() => resolveDeath(G, 'nobody')).toThrow();
  });
});
