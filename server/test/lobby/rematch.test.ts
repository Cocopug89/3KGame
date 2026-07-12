// 7.2 — the rematch: a NEW match behind the SAME room code, allowed only once
// the current match is decided. The 409-while-running rule doubles as the race
// guard: the first of two rematch clicks rebinds the code to a fresh,
// unfinished match, so the second click 409s and its client just refetches.

import { describe, it, expect } from 'vitest';
import type { StorageAPI } from 'boardgame.io';
import { ThreeKingdomsGame } from '../../src/bgio/game.js';
import { RoomRegistry } from '../../src/lobby/roomCodes.js';
import { RoomApi, RoomError } from '../../src/lobby/rooms.js';

interface Stored {
  initialState: { G: Record<string, unknown> };
  state: { G: Record<string, unknown> };
  metadata: Record<string, unknown>;
}

/** Mirrors bgio's InMemory store for the three calls RoomApi makes: created
 * matches start with state = initialState, and fetch serves both. */
class FakeDb {
  readonly matches = new Map<string, Stored>();

  createMatch(
    matchID: string,
    match: { initialState: Stored['initialState']; metadata: Stored['metadata'] },
  ): void {
    this.matches.set(matchID, { ...match, state: match.initialState });
  }

  fetch(matchID: string): Partial<Stored> {
    const m = this.matches.get(matchID);
    return m ? { metadata: m.metadata, state: m.state } : {};
  }
}

function makeApi(uuids: string[] = ['match-1', 'match-2', 'match-3']) {
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

describe('RoomApi.rematch', () => {
  it('409s while the match is still running — which is also the double-click guard', async () => {
    const { api } = makeApi();
    const created = await api.createRoom(4);
    await expect(api.rematch(created.roomCode)).rejects.toMatchObject(
      new RoomError(409, 'match still running'),
    );
  });

  it('rebinds the SAME code to a fresh match once the game is over', async () => {
    const { api, db, rooms } = makeApi();
    const created = await api.createRoom(4);

    // The stored state is immer-frozen — swap it wholesale, as a finished
    // match's reducer would have produced a new state object anyway.
    const m = db.matches.get('match-1')!;
    m.state = { G: { ...m.state.G, gameOver: { winners: ['0'], condition: 'lord' } } };

    const rematched = await api.rematch(created.roomCode);
    expect(rematched.roomCode).toBe(created.roomCode);
    expect(rematched.matchID).toBe('match-2');
    expect(rematched.numPlayers).toBe(4);
    // The code now resolves to the new match; the old one is unhooked.
    expect(rooms.resolve(created.roomCode)?.matchID).toBe('match-2');
    // Fresh match: all seats empty again, waiting on selection.
    expect(rematched.joinedCount).toBe(0);
    // And a second rematch 409s, because the new match is not over.
    await expect(api.rematch(created.roomCode)).rejects.toMatchObject(
      new RoomError(409, 'match still running'),
    );
  });

  it('404s an unknown code', async () => {
    const { api } = makeApi();
    await expect(api.rematch('XXXXX')).rejects.toMatchObject(new RoomError(404, 'room not found'));
  });
});
