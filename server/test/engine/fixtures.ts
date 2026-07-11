// Test-only helpers for constructing minimal GState/PlayerState fixtures.
// Not a *.test.ts file on purpose — vitest shouldn't try to run this as a
// suite. See docs/engine-design.md §1 for the real shapes.

import type { GState, PlayerState } from '../../src/engine/state.js';
import type { RNG } from '../../src/engine/rng.js';

export function makePlayer(id: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    seat: Number(id),
    role: 'rebel',
    roleRevealed: false,
    generalId: 'cao_cao',
    maxHp: 4,
    hp: 4,
    alive: true,
    hand: [],
    equipment: { weapon: null, armour: null, plusHorse: null, minusHorse: null },
    judgementZone: [],
    flags: {},
    ...overrides,
  };
}

export function makeGState(overrides: Partial<GState> = {}): GState {
  return {
    drawPile: [],
    discardPile: [],
    revealed: [],
    players: { '0': makePlayer('0'), '1': makePlayer('1') },
    seats: ['0', '1'],
    activeSeat: 0,
    turnPhase: 'action',
    skipPhases: [],
    turnFlags: { strikesPlayed: 0, strikeLimit: 1 },
    stack: [],
    pending: null,
    selection: null,
    damage: null,
    demand: null,
    judgement: null,
    log: [],
    ...overrides,
  };
}

/** Leaves order untouched — proves a function delegates to the RNG without
 * needing real randomness in a test. */
export const identityRng: RNG = { shuffle: (items) => [...items] };

/** Deterministic but order-changing — proves shuffleDeck() actually calls
 * through to the RNG rather than silently no-op'ing. */
export const reverseRng: RNG = { shuffle: (items) => [...items].reverse() };
