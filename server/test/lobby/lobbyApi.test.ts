// Task 5.1 — end-to-end against the *real* boardgame.io server: our two room
// routes riding on the framework's own lobby router, and the framework's own
// join endpoint filling seats behind our code.
//
// This is the test that would have caught the things a unit test can't: that
// `server.router` accepts extra routes at all, that they survive `run()`
// mounting the app, that the code path and bgio's `/games/...` paths don't
// collide, and that a match created by our route is one bgio's own LobbyClient
// is willing to join.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import { Server, Origins } from 'boardgame.io/dist/cjs/server.js';
import { LobbyClient } from 'boardgame.io/dist/cjs/client.js';
import { THREE_KINGDOMS_GAME_NAME } from '@3k/shared';
import { ThreeKingdomsGame } from '../../src/bgio/game.js';
import { RoomRegistry } from '../../src/lobby/roomCodes.js';
import { RoomApi } from '../../src/lobby/rooms.js';
import { registerRoomRoutes } from '../../src/lobby/routes.js';

let running: { appServer: { address(): AddressInfo | string | null }; apiServer?: unknown };
let server: ReturnType<typeof Server>;
let base: string;
let lobby: LobbyClient;

beforeAll(async () => {
  server = Server({
    games: [ThreeKingdomsGame],
    origins: [Origins.LOCALHOST_IN_DEVELOPMENT],
  });
  registerRoomRoutes(
    server.router,
    new RoomApi({ db: server.db, game: ThreeKingdomsGame, rooms: new RoomRegistry() }),
  );

  running = (await server.run(0)) as typeof running;
  const address = running.appServer.address() as AddressInfo;
  base = `http://localhost:${address.port}`;
  lobby = new LobbyClient({ server: base });
});

afterAll(() => {
  server.kill(running as never);
});

async function createRoom(numPlayers: number) {
  const res = await fetch(`${base}/rooms?numPlayers=${numPlayers}`, { method: 'POST' });
  return { status: res.status, body: await res.json() };
}

async function getRoom(code: string) {
  const res = await fetch(`${base}/rooms/${code}`);
  return { status: res.status, body: await res.json() };
}

describe('POST /rooms', () => {
  it('creates a room and hands back a short code plus the real matchID', async () => {
    const { status, body } = await createRoom(4);

    expect(status).toBe(200);
    expect(body.roomCode).toMatch(/^[A-Z0-9]{5}$/);
    expect(body.matchID).toEqual(expect.any(String));
    expect(body.gameName).toBe(THREE_KINGDOMS_GAME_NAME);
    expect(body.seats).toHaveLength(4);
    expect(body.full).toBe(false);
  });

  it('rejects a player count outside the game bounds', async () => {
    for (const bad of [3, 9, 'six']) {
      const { status } = await createRoom(bad as number);
      expect(status).toBe(400);
    }
  });
});

describe('GET /rooms/:code', () => {
  it('resolves a code however the human typed it', async () => {
    const { body: created } = await createRoom(4);

    for (const variant of [created.roomCode, created.roomCode.toLowerCase()]) {
      const { status, body } = await getRoom(variant);
      expect(status).toBe(200);
      expect(body.matchID).toBe(created.matchID);
      expect(body.roomCode).toBe(created.roomCode);
    }
  });

  it('404s an unknown code', async () => {
    const { status, body } = await getRoom('ZZZZZ');
    expect(status).toBe(404);
    expect(body.error).toBeTruthy();
  });
});

describe('joining a room (boardgame.io lobby endpoints, found via the code)', () => {
  it('seats a player in the seat they picked, and reports it under the code', async () => {
    const { body: room } = await createRoom(4);

    const { playerID, playerCredentials } = await lobby.joinMatch(
      THREE_KINGDOMS_GAME_NAME,
      room.matchID,
      { playerID: '2', playerName: 'Coco' },
    );

    expect(playerID).toBe('2');
    expect(playerCredentials).toEqual(expect.any(String));

    const { body: after } = await getRoom(room.roomCode);
    expect(after.seats[2]).toEqual({ seat: 2, playerID: '2', name: 'Coco' });
    expect(after.joinedCount).toBe(1);
    expect(after.full).toBe(false);
    // Seat order is turn order, so the seat a player took is the seat they get.
    expect(after.seats.map((s: { name: string | null }) => s.name)).toEqual([
      null,
      null,
      'Coco',
      null,
    ]);
  });

  it('marks the room full once every seat is taken', async () => {
    const { body: room } = await createRoom(4);

    for (const seat of ['0', '1', '2', '3']) {
      await lobby.joinMatch(THREE_KINGDOMS_GAME_NAME, room.matchID, {
        playerID: seat,
        playerName: `P${seat}`,
      });
    }

    const { body: after } = await getRoom(room.roomCode);
    expect(after.joinedCount).toBe(4);
    expect(after.full).toBe(true);
  });

  it('refuses a seat someone else already took', async () => {
    const { body: room } = await createRoom(4);
    await lobby.joinMatch(THREE_KINGDOMS_GAME_NAME, room.matchID, {
      playerID: '1',
      playerName: 'First',
    });

    await expect(
      lobby.joinMatch(THREE_KINGDOMS_GAME_NAME, room.matchID, {
        playerID: '1',
        playerName: 'Second',
      }),
    ).rejects.toThrow();
  });

  it('frees the seat again when a player leaves', async () => {
    const { body: room } = await createRoom(4);
    const { playerCredentials } = await lobby.joinMatch(THREE_KINGDOMS_GAME_NAME, room.matchID, {
      playerID: '0',
      playerName: 'Coco',
    });
    // Someone else stays behind — an empty match gets wiped (next test).
    await lobby.joinMatch(THREE_KINGDOMS_GAME_NAME, room.matchID, {
      playerID: '1',
      playerName: 'Stayer',
    });

    await lobby.leaveMatch(THREE_KINGDOMS_GAME_NAME, room.matchID, {
      playerID: '0',
      credentials: playerCredentials,
    });

    const { body: after } = await getRoom(room.roomCode);
    expect(after.seats[0].name).toBeNull();
    expect(after.seats[1].name).toBe('Stayer');
    expect(after.joinedCount).toBe(1);
  });

  it('takes the room down with the last player who leaves', async () => {
    // boardgame.io's /leave route wipes the match once no named player is
    // left in it. The code has to go with it — resolving a code onto a match
    // that no longer exists is exactly the dangling pointer we must not hand
    // a joiner. describeRoom() drops it and 404s.
    const { body: room } = await createRoom(4);
    const { playerCredentials } = await lobby.joinMatch(THREE_KINGDOMS_GAME_NAME, room.matchID, {
      playerID: '0',
      playerName: 'Only',
    });

    await lobby.leaveMatch(THREE_KINGDOMS_GAME_NAME, room.matchID, {
      playerID: '0',
      credentials: playerCredentials,
    });

    const { status, body } = await getRoom(room.roomCode);
    expect(status).toBe(404);
    expect(body.error).toBeTruthy();
  });
});

describe('room privacy', () => {
  it('keeps rooms out of the public match listing — the code is the only way in', async () => {
    await createRoom(4);
    const res = await fetch(`${base}/games/${THREE_KINGDOMS_GAME_NAME}`);
    const body = await res.json();
    expect(body.matches).toEqual([]);
  });
});
