// Task 5.1 — RoomApi against a fake match store. The HTTP/framework side is
// covered separately (test/lobby/lobbyApi.test.ts, which boots the real
// boardgame.io server); this file is about what the API *does*: creating a
// real match behind a code, and reporting seats truthfully.

import { describe, it, expect } from 'vitest';
import type { StorageAPI } from 'boardgame.io';
import { ThreeKingdomsGame } from '../../src/bgio/game.js';
import { RoomRegistry } from '../../src/lobby/roomCodes.js';
import { RoomApi, RoomError } from '../../src/lobby/rooms.js';
import type { GState } from '../../src/engine/state.js';

interface StoredMatch {
  initialState: { G: GState };
  metadata: {
    gameName: string;
    unlisted?: boolean;
    players: Record<number, { id: number; name?: string; credentials?: string }>;
    createdAt: number;
    updatedAt: number;
  };
}

/** The two methods RoomApi touches, nothing more. */
class FakeDb {
  readonly matches = new Map<string, StoredMatch>();

  createMatch(matchID: string, match: StoredMatch): void {
    this.matches.set(matchID, match);
  }

  fetch(matchID: string): { metadata?: StoredMatch['metadata'] } {
    const match = this.matches.get(matchID);
    return match ? { metadata: match.metadata } : {};
  }
}

function makeApi(uuids: string[] = ['match-1', 'match-2']) {
  const db = new FakeDb();
  const rooms = new RoomRegistry();
  let i = 0;
  const api = new RoomApi({
    db: db as unknown as StorageAPI.Sync,
    game: ThreeKingdomsGame,
    rooms,
    uuid: () => uuids[i++],
  });
  return { api, db, rooms };
}

describe('RoomApi.createRoom', () => {
  it('creates a real match — dealt roles, and a table waiting on general selection', async () => {
    const { api, db, rooms } = makeApi();

    const summary = await api.createRoom(5);

    expect(summary.matchID).toBe('match-1');
    expect(summary.gameName).toBe('three-kingdoms-kill');
    expect(summary.numPlayers).toBe(5);
    expect(rooms.resolve(summary.roomCode)?.matchID).toBe('match-1');

    // A room is a match the moment it exists — but since task 5.2 it is a match
    // that has NOT been dealt: roles are assigned and the Lord is revealed, and
    // the state then waits in the general-selection window. Hands, hit points
    // and turn 1 all arrive when the last player picks (engine/selection.ts).
    const stored = db.matches.get('match-1')!;
    const G = stored.initialState.G;
    expect(G.seats).toEqual(['0', '1', '2', '3', '4']);
    expect(Object.values(G.players).filter((p) => p.role === 'lord')).toHaveLength(1);
    expect(Object.values(G.players).every((p) => p.hand.length === 0)).toBe(true);
    expect(Object.values(G.players).every((p) => p.generalId === '')).toBe(true);
    expect(G.stack).toEqual([]);
    expect(G.pending).toBeNull();

    // The Lord is the only one being asked, and only they can see their own
    // candidates — a wider pool than everyone else's.
    expect(G.selection).not.toBeNull();
    expect(G.selection!.awaiting).toEqual([G.selection!.lord]);
    expect(G.selection!.candidates[G.selection!.lord]).toHaveLength(5);
    expect(G.drawPile).toHaveLength(107); // nothing dealt yet
  });

  it('keeps rooms unlisted — they are shared by code, never browsed', async () => {
    const { api, db } = makeApi();
    await api.createRoom(4);
    expect(db.matches.get('match-1')!.metadata.unlisted).toBe(true);
  });

  it('opens every seat empty, in seat order', async () => {
    const { api } = makeApi();
    const summary = await api.createRoom(4);

    expect(summary.seats).toEqual([
      { seat: 0, playerID: '0', name: null },
      { seat: 1, playerID: '1', name: null },
      { seat: 2, playerID: '2', name: null },
      { seat: 3, playerID: '3', name: null },
    ]);
    expect(summary.joinedCount).toBe(0);
    expect(summary.full).toBe(false);
  });

  it("rejects a player count the game doesn't support", async () => {
    const { api } = makeApi();
    for (const bad of [3, 9, 0, -1, Number.NaN, 4.5]) {
      await expect(api.createRoom(bad)).rejects.toBeInstanceOf(RoomError);
    }
    await expect(api.createRoom(3)).rejects.toMatchObject({ status: 400 });
  });

  it('gives two rooms two different codes', async () => {
    const { api } = makeApi();
    const a = await api.createRoom(4);
    const b = await api.createRoom(4);
    expect(a.roomCode).not.toBe(b.roomCode);
    expect(a.matchID).not.toBe(b.matchID);
  });
});

describe('RoomApi.describeRoom', () => {
  it('reports who has taken which seat, and when the room is full', async () => {
    const { api, db } = makeApi();
    const created = await api.createRoom(4);
    const players = db.matches.get('match-1')!.metadata.players;

    // A join (boardgame.io's own /join route) writes the name into metadata.
    players[2].name = 'Coco';

    const partial = await api.describeRoom(created.roomCode);
    expect(partial.seats[2]).toEqual({ seat: 2, playerID: '2', name: 'Coco' });
    expect(partial.joinedCount).toBe(1);
    expect(partial.full).toBe(false);

    players[0].name = 'A';
    players[1].name = 'B';
    players[3].name = 'D';

    const full = await api.describeRoom(created.roomCode);
    expect(full.joinedCount).toBe(4);
    expect(full.full).toBe(true);
    expect(full.seats.map((s) => s.name)).toEqual(['A', 'B', 'Coco', 'D']);
  });

  it('never leaks credentials, only names', async () => {
    const { api, db } = makeApi();
    const created = await api.createRoom(4);
    const players = db.matches.get('match-1')!.metadata.players;
    players[0].name = 'Coco';
    players[0].credentials = 'super-secret';

    const summary = await api.describeRoom(created.roomCode);
    expect(JSON.stringify(summary)).not.toContain('super-secret');
    expect(Object.keys(summary.seats[0])).toEqual(['seat', 'playerID', 'name']);
  });

  it('accepts the code the way a human typed it', async () => {
    const { api } = makeApi();
    const created = await api.createRoom(4);
    const messy = ` ${created.roomCode.toLowerCase()} `;
    await expect(api.describeRoom(messy)).resolves.toMatchObject({ roomCode: created.roomCode });
  });

  it('404s an unknown code', async () => {
    const { api } = makeApi();
    await expect(api.describeRoom('ZZZZZ')).rejects.toMatchObject({ status: 404 });
  });

  it('drops a code whose match no longer exists rather than handing out a dangling one', async () => {
    const { api, db, rooms } = makeApi();
    const created = await api.createRoom(4);

    db.matches.delete('match-1'); // e.g. the in-memory store died with the process

    await expect(api.describeRoom(created.roomCode)).rejects.toMatchObject({ status: 404 });
    expect(rooms.resolve(created.roomCode)).toBeUndefined();
    expect(rooms.size).toBe(0);
  });
});
