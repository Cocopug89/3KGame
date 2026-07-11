// Task 5.2 — the drift guard between the two halves of a move.
//
// boardgame.io's client dispatches a move by name into a stage by name, and its
// own game config has to declare both. That config lives in the client
// (client/src/lobby/clientGame.ts) and is built from @3k/shared's
// THREE_KINGDOMS_STAGE_MOVES. If the server ever renames a stage or adds a move
// without updating that map, the client keeps compiling and the move simply
// never arrives — the worst possible failure, because it looks like a server
// that ignored you.
//
// So: the map and the real game must agree, exactly, in both directions.

import { describe, it, expect } from 'vitest';
import { THREE_KINGDOMS_STAGE_MOVES } from '@3k/shared';
import { ThreeKingdomsGame } from '../../src/bgio/game.js';

const stages = ThreeKingdomsGame.turn?.stages ?? {};

describe('the shared stage/move map', () => {
  it('names every stage the server actually has, and no others', () => {
    expect(Object.keys(stages).sort()).toEqual(Object.keys(THREE_KINGDOMS_STAGE_MOVES).sort());
  });

  it('names every move each of those stages accepts, and no others', () => {
    for (const [stage, moves] of Object.entries(THREE_KINGDOMS_STAGE_MOVES)) {
      const real = Object.keys(stages[stage]?.moves ?? {});
      expect(real.sort(), `stage '${stage}'`).toEqual([...moves].sort());
    }
  });
});
