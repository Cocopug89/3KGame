import { describe, it, expect } from 'vitest';
import { seatDistance, distance, attackRange, inAttackRange } from '../../src/engine/distance.js';
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

describe('seatDistance', () => {
  it('is 0 for a player and themselves', () => {
    const G = fourPlayerState();
    expect(seatDistance(G, '0', '0')).toBe(0);
  });

  it('is symmetric and takes the shorter way around', () => {
    const G = fourPlayerState();
    expect(seatDistance(G, '0', '1')).toBe(1);
    expect(seatDistance(G, '0', '2')).toBe(2); // opposite seat in a 4-circle
    expect(seatDistance(G, '0', '3')).toBe(1); // adjacent the other way
    expect(seatDistance(G, '1', '0')).toBe(seatDistance(G, '0', '1'));
  });

  it('skips dead seats without collapsing the circle', () => {
    const G = fourPlayerState();
    G.players['1'].alive = false; // seat 1 is dead
    // living order is now 0, 2, 3 (circle) — 0 to 2 is 1 step, not 2.
    expect(seatDistance(G, '0', '2')).toBe(1);
    expect(seatDistance(G, '0', '3')).toBe(1);
  });

  it('throws for a dead or unseated player', () => {
    const G = fourPlayerState();
    G.players['1'].alive = false;
    expect(() => seatDistance(G, '0', '1')).toThrow();
    expect(() => seatDistance(G, '0', 'nobody')).toThrow();
  });
});

describe('distance', () => {
  it('matches seatDistance with no horses', () => {
    const G = fourPlayerState();
    expect(distance(G, '0', '2')).toBe(2);
  });

  it('−1 horse only helps the *owner* attack outward (asymmetric)', () => {
    const G = fourPlayerState();
    G.players['0'].equipment.minusHorse = 'red_hare_5h';
    expect(distance(G, '0', '2')).toBe(1); // 0 attacking 2: 2 - 1 = 1
    expect(distance(G, '2', '0')).toBe(2); // 2 attacking 0: horse doesn't help the defender
  });

  it('+1 horse only helps the *owner* defend (asymmetric)', () => {
    const G = fourPlayerState();
    G.players['2'].equipment.plusHorse = 'shadow_5s';
    expect(distance(G, '0', '2')).toBe(3); // 0 attacking 2: 2 + 1 = 3
    expect(distance(G, '2', '0')).toBe(2); // 2 attacking 0: own +1 horse doesn't help offense
  });

  it('clamps to a minimum of 1 even when horses would push it to 0 or below', () => {
    const G = fourPlayerState();
    G.players['0'].equipment.minusHorse = 'red_hare_5h';
    expect(distance(G, '0', '1')).toBe(1); // base 1, -1 horse would give 0, clamped to 1
  });
});

describe('attackRange / inAttackRange', () => {
  it('is 1 with no weapon equipped', () => {
    const G = fourPlayerState();
    expect(attackRange(G, '0')).toBe(1);
  });

  it("uses the equipped weapon's range field", () => {
    const G = fourPlayerState();
    G.players['0'].equipment.weapon = 'green_dragon_blade_5s'; // range 3
    expect(attackRange(G, '0')).toBe(3);
  });

  it('inAttackRange checks distance against the attacker\'s range', () => {
    const G = fourPlayerState();
    expect(inAttackRange(G, '0', '2')).toBe(false); // distance 2, range 1
    G.players['0'].equipment.weapon = 'rock_cleaving_axe_5d'; // range 3
    expect(inAttackRange(G, '0', '2')).toBe(true);
  });
});
