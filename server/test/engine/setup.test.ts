import { describe, it, expect } from 'vitest';
import { generals } from '@3k/shared';
import { roleCountsForPlayerCount, assignRoles, initGame } from '../../src/engine/setup.js';
import { reverseRng } from './fixtures.js';
import type { RNG } from '../../src/engine/rng.js';

// A no-op shuffle keeps role/deck order predictable for assertions that
// care about *which* seat ends up with which role.
const identityRng: RNG = { shuffle: (items) => [...items] };

describe('roleCountsForPlayerCount', () => {
  it('matches the plan §2 table for 4-8 players', () => {
    expect(roleCountsForPlayerCount(4)).toEqual({ lord: 1, loyalist: 1, rebel: 1, traitor: 1 });
    expect(roleCountsForPlayerCount(5)).toEqual({ lord: 1, loyalist: 1, rebel: 2, traitor: 1 });
    expect(roleCountsForPlayerCount(6)).toEqual({ lord: 1, loyalist: 1, rebel: 3, traitor: 1 });
    expect(roleCountsForPlayerCount(7)).toEqual({ lord: 1, loyalist: 2, rebel: 3, traitor: 1 });
    expect(roleCountsForPlayerCount(8)).toEqual({ lord: 1, loyalist: 2, rebel: 4, traitor: 1 });
  });

  it('throws for an unsupported player count', () => {
    expect(() => roleCountsForPlayerCount(3)).toThrow();
    expect(() => roleCountsForPlayerCount(9)).toThrow();
  });
});

describe('assignRoles', () => {
  it('assigns exactly one role per player, matching the count table', () => {
    const playerIds = ['0', '1', '2', '3', '4'];
    const roles = assignRoles(playerIds, identityRng);
    expect(Object.keys(roles).sort()).toEqual(playerIds.slice().sort());
    const counts = { lord: 0, loyalist: 0, rebel: 0, traitor: 0 };
    for (const role of Object.values(roles)) counts[role] += 1;
    expect(counts).toEqual(roleCountsForPlayerCount(5));
  });

  it('is exactly one Lord regardless of shuffle', () => {
    const playerIds = ['0', '1', '2', '3', '4', '5', '6', '7'];
    const roles = assignRoles(playerIds, reverseRng);
    const lords = Object.values(roles).filter((r) => r === 'lord');
    expect(lords).toHaveLength(1);
  });
});

describe('initGame', () => {
  const playerIds = ['0', '1', '2', '3'];
  const generalIds = { '0': 'cao_cao', '1': 'sima_yi', '2': 'xiahou_dun', '3': 'zhang_liao' };

  it('deals a 4-card opening hand to every player, drawn off the top', () => {
    const G = initGame({ playerIds, generalIds }, identityRng);
    for (const id of playerIds) {
      expect(G.players[id].hand).toHaveLength(4);
    }
    // 107 total, 16 dealt (4 players x 4 cards) = 91 left in the draw pile.
    expect(G.drawPile).toHaveLength(107 - 4 * playerIds.length);
    expect(G.discardPile).toHaveLength(0);
  });

  it("gives the Lord +1 max HP over their general's base", () => {
    const G = initGame({ playerIds, generalIds }, identityRng);
    const lord = Object.values(G.players).find((p) => p.role === 'lord')!;
    const baseHp = generals.find((g) => g.id === lord.generalId)!.maxHp;
    expect(lord.maxHp).toBe(baseHp + 1);
    expect(lord.hp).toBe(lord.maxHp);

    const nonLords = Object.values(G.players).filter((p) => p.role !== 'lord');
    for (const p of nonLords) {
      const general = generals.find((g) => g.id === p.generalId)!;
      expect(p.maxHp).toBe(general.maxHp);
    }
  });

  it('reveals only the Lord\'s role at setup', () => {
    const G = initGame({ playerIds, generalIds }, identityRng);
    for (const p of Object.values(G.players)) {
      expect(p.roleRevealed).toBe(p.role === 'lord');
    }
  });

  it('seeds the stack with the first prep phase and leaves it unresolved', () => {
    const G = initGame({ playerIds, generalIds }, identityRng);
    expect(G.stack).toEqual([{ t: 'phase', phase: 'prep' }]);
    expect(G.pending).toBeNull();
    expect(G.turnPhase).toBe('prep');
    expect(G.activeSeat).toBe(0);
  });

  it('throws for an unsupported player count', () => {
    expect(() => initGame({ playerIds: ['0', '1', '2'], generalIds }, identityRng)).toThrow();
  });

  it('throws for a duplicate player id', () => {
    expect(() =>
      initGame({ playerIds: ['0', '0', '1', '2'], generalIds }, identityRng),
    ).toThrow();
  });

  it('throws if a player has no chosen general', () => {
    const incomplete = { '0': 'cao_cao', '1': 'sima_yi', '2': 'xiahou_dun' };
    expect(() => initGame({ playerIds, generalIds: incomplete }, identityRng)).toThrow();
  });
});
