// Task 5.1 — unit tests for the code registry. Pure, no server, no db.

import { describe, it, expect } from 'vitest';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  RoomRegistry,
  generateRoomCode,
  isWellFormedRoomCode,
  normalizeRoomCode,
} from '../../src/lobby/roomCodes.js';

/** Deterministic "random" that walks a fixed list of indices. */
function scriptedRandomInt(indices: number[]): () => number {
  let i = 0;
  return () => indices[i++ % indices.length];
}

describe('room code alphabet', () => {
  it('excludes the characters people confuse when reading a code aloud', () => {
    for (const banned of ['I', 'O', '0', '1', 'S', '5', 'B', '8', 'Z', '2', 'G', '6']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(banned);
    }
  });

  it('has no duplicate symbols', () => {
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length);
  });
});

describe('normalizeRoomCode', () => {
  it('uppercases and strips what a human types around the code', () => {
    expect(normalizeRoomCode(' wu-xin ')).toBe('WUXIN');
    expect(normalizeRoomCode('wuxin')).toBe('WUXIN');
    expect(normalizeRoomCode('')).toBe('');
  });
});

describe('generateRoomCode', () => {
  it('produces a code of the right length, all from the alphabet', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    expect(isWellFormedRoomCode(code)).toBe(true);
  });

  it('is driven entirely by the injected randomness', () => {
    const code = generateRoomCode(scriptedRandomInt([0, 1, 2, 3, 4]));
    expect(code).toBe(ROOM_CODE_ALPHABET.slice(0, 5));
  });
});

describe('RoomRegistry', () => {
  it('registers a code for a match and resolves it back, case-insensitively', () => {
    const registry = new RoomRegistry({ now: () => 1000 });
    const room = registry.create('match-a', 5);

    expect(room.matchID).toBe('match-a');
    expect(room.numPlayers).toBe(5);
    expect(room.createdAt).toBe(1000);
    expect(isWellFormedRoomCode(room.code)).toBe(true);

    expect(registry.resolve(room.code)).toEqual(room);
    expect(registry.resolve(room.code.toLowerCase())).toEqual(room);
    expect(registry.resolve(`  ${room.code}  `)).toEqual(room);
    expect(registry.codeForMatch('match-a')).toBe(room.code);
  });

  it('re-rolls past a collision instead of overwriting an existing room', () => {
    // First two draws produce the same code; the third draw differs.
    const randomInt = scriptedRandomInt([0, 0, 0, 0, 0, /* collision: */ 0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
    const registry = new RoomRegistry({ randomInt });

    const first = registry.create('match-a', 4);
    const second = registry.create('match-b', 4);

    expect(second.code).not.toBe(first.code);
    expect(registry.resolve(first.code)?.matchID).toBe('match-a');
    expect(registry.resolve(second.code)?.matchID).toBe('match-b');
    expect(registry.size).toBe(2);
  });

  it('refuses to give one match a second code', () => {
    const registry = new RoomRegistry();
    registry.create('match-a', 4);
    expect(() => registry.create('match-a', 4)).toThrow(/already has code/);
  });

  it('gives up rather than spinning forever when the code space is exhausted', () => {
    // A randomInt that only ever returns 0 can produce exactly one code.
    const registry = new RoomRegistry({ randomInt: () => 0 });
    registry.create('match-a', 4);
    expect(() => registry.create('match-b', 4)).toThrow(/no free room code/);
  });

  it('resolves nothing for an unknown or malformed code', () => {
    const registry = new RoomRegistry();
    expect(registry.resolve('ZZZZZ')).toBeUndefined();
    expect(registry.resolve('')).toBeUndefined();
  });

  it('releases a code, freeing it and its match mapping', () => {
    const registry = new RoomRegistry();
    const room = registry.create('match-a', 4);

    expect(registry.release(room.code)).toBe(true);
    expect(registry.release(room.code)).toBe(false);
    expect(registry.resolve(room.code)).toBeUndefined();
    expect(registry.codeForMatch('match-a')).toBeUndefined();
    expect(registry.size).toBe(0);
  });

  it('prunes only rooms older than the cutoff', () => {
    let clock = 0;
    const registry = new RoomRegistry({ now: () => clock });

    const old = registry.create('match-old', 4);
    clock = 10_000;
    const fresh = registry.create('match-fresh', 4);
    clock = 12_000;

    const pruned = registry.prune(5_000); // anything created before t=7000

    expect(pruned.map((r) => r.code)).toEqual([old.code]);
    expect(registry.resolve(old.code)).toBeUndefined();
    expect(registry.resolve(fresh.code)?.matchID).toBe('match-fresh');
    expect(registry.size).toBe(1);
  });
});
