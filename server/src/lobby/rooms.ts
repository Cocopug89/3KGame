// Task 5.1 — the room API proper: create a match behind a short code, and
// describe who's sitting where.
//
// Deliberately *not* a reimplementation of boardgame.io's lobby. Joining,
// leaving and credentialing stay on the framework's own endpoints
// (POST /games/:name/:id/join, .../leave — the client hits them via
// LobbyClient), because that's where credentials are minted and where the
// socket master expects the metadata to have come from. All we add is:
//
//   1. match creation behind a human-readable code (so the UUID never has to
//      be read aloud), and
//   2. a seat view of a match keyed by that code (so a joiner can see which
//      seats are free *before* picking one — seat order is turn order).
//
// Match creation uses boardgame.io's own `createMatch` from its `internal`
// entry point (same function its POST /games/:name/create route calls), so
// initial state + metadata are built exactly the way the framework expects —
// no parallel implementation to drift.

import { randomUUID } from 'node:crypto';
// Deep CJS import: Node ESM can't do the bare `boardgame.io/internal`
// directory import (no "exports" map — same issue as `boardgame.io/server`
// and `/core`, see boardgame-io-server.d.ts, which shims the types).
import { createMatch } from 'boardgame.io/dist/cjs/internal.js';
import type { Game, Server as BgioServer, StorageAPI } from 'boardgame.io';
import { RoomRegistry } from './roomCodes.js';

/** Carries the HTTP status the route layer should map it to. */
export class RoomError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'RoomError';
  }
}

export interface Seat {
  /** Seat index = boardgame.io playerID = GState.seats index = turn order. */
  seat: number;
  playerID: string;
  /** null ⇔ nobody has taken this seat yet. */
  name: string | null;
}

export interface RoomSummary {
  roomCode: string;
  matchID: string;
  gameName: string;
  numPlayers: number;
  seats: Seat[];
  joinedCount: number;
  full: boolean;
  createdAt: number;
}

export interface RoomApiOpts {
  db: StorageAPI.Sync | StorageAPI.Async;
  game: Game;
  rooms: RoomRegistry;
  /** Injectable for tests. */
  uuid?: () => string;
}

export class RoomApi {
  private readonly db: StorageAPI.Sync | StorageAPI.Async;
  private readonly game: Game;
  private readonly rooms: RoomRegistry;
  private readonly uuid: () => string;

  constructor(opts: RoomApiOpts) {
    this.db = opts.db;
    this.game = opts.game;
    this.rooms = opts.rooms;
    this.uuid = opts.uuid ?? randomUUID;
  }

  async createRoom(numPlayers: number): Promise<RoomSummary> {
    const min = this.game.minPlayers ?? 1;
    const max = this.game.maxPlayers ?? Number.MAX_SAFE_INTEGER;
    if (!Number.isInteger(numPlayers) || numPlayers < min || numPlayers > max) {
      throw new RoomError(400, `numPlayers must be an integer between ${min} and ${max}`);
    }

    // Runs the game's setup() right here, exactly as bgio's own create route
    // does — a room *is* a match from the moment it exists. `selectGenerals`
    // (task 5.2) is what keeps that from meaning "already dealt": roles are
    // assigned and the Lord revealed, but the state then waits in a selection
    // window, and hands aren't dealt until the last player has picked. Players
    // therefore fill the seats in front of a table that hasn't been dealt yet,
    // which is the order the tabletop game does it in.
    const match = createMatch({
      game: this.game,
      numPlayers,
      setupData: { selectGenerals: true },
      // Rooms are private by design: shared by code, never listed by
      // GET /games/:name. Nobody browses into a friends' game.
      unlisted: true,
    });
    if ('setupDataError' in match) {
      throw new RoomError(400, match.setupDataError);
    }

    const matchID = this.uuid();
    await this.db.createMatch(matchID, match);
    const room = this.rooms.create(matchID, numPlayers);

    return this.summarize(room.code, matchID, room.createdAt, match.metadata);
  }

  /**
   * Seat view of a room. Note the empty-room case: boardgame.io's own /leave
   * route *wipes the match* once the last named player leaves it — so a room
   * everyone walked out of doesn't linger half-alive, it stops existing, and
   * the code below is what notices and drops the now-dangling code.
   */
  async describeRoom(rawCode: string): Promise<RoomSummary> {
    const room = this.rooms.resolve(rawCode);
    if (!room) throw new RoomError(404, 'room not found');

    const { metadata } = await this.db.fetch(room.matchID, { metadata: true });
    if (!metadata) {
      // The code outlived its match (process restart with the default
      // in-memory store, or a manual wipe). Don't hand out a dangling code.
      this.rooms.release(room.code);
      throw new RoomError(404, 'room not found');
    }

    return this.summarize(room.code, room.matchID, room.createdAt, metadata);
  }

  /**
   * 7.2: "再来一局" — a NEW match behind the SAME room code. Only a finished
   * match may be rematched (409 otherwise), which is also what makes two
   * players racing the button safe: the first click rebinds the code to a
   * fresh, unfinished match, so the second click gets the 409 and its client
   * just refetches the room. Seats are NOT copied over — each client re-joins
   * its old seat index with its stored name (LobbyPage's game-over poll), so
   * credentials are minted the normal way through bgio's own /join, never
   * cloned across matches.
   */
  async rematch(rawCode: string): Promise<RoomSummary> {
    const room = this.rooms.resolve(rawCode);
    if (!room) throw new RoomError(404, 'room not found');

    const { state, metadata } = await this.db.fetch(room.matchID, {
      state: true,
      metadata: true,
    });
    if (!metadata) {
      this.rooms.release(room.code);
      throw new RoomError(404, 'room not found');
    }
    if (!state?.G?.gameOver) throw new RoomError(409, 'match still running');

    const match = createMatch({
      game: this.game,
      numPlayers: room.numPlayers,
      setupData: { selectGenerals: true },
      unlisted: true,
    });
    if ('setupDataError' in match) throw new RoomError(400, match.setupDataError);

    const matchID = this.uuid();
    await this.db.createMatch(matchID, match);
    const rebound = this.rooms.rebind(room.code, matchID);
    if (!rebound) throw new RoomError(404, 'room not found'); // raced a prune

    return this.summarize(rebound.code, matchID, rebound.createdAt, match.metadata);
  }

  private summarize(
    roomCode: string,
    matchID: string,
    createdAt: number,
    metadata: BgioServer.MatchData,
  ): RoomSummary {
    const seats: Seat[] = Object.values(metadata.players)
      .map((p) => ({
        seat: Number(p.id),
        playerID: String(p.id),
        // Credentials live next to the name in bgio's metadata — only the
        // name is ever copied out. Nothing else from `metadata.players` may
        // leave this method.
        name: p.name ?? null,
      }))
      .sort((a, b) => a.seat - b.seat);

    const joinedCount = seats.filter((s) => s.name !== null).length;

    return {
      roomCode,
      matchID,
      gameName: metadata.gameName,
      numPlayers: seats.length,
      seats,
      joinedCount,
      full: joinedCount === seats.length,
      createdAt,
    };
  }
}
