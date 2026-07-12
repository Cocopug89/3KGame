// Task 5.1 — join-by-code rooms: the short-code ⇄ matchID registry.
//
// Framework-free on purpose (no boardgame.io, no Koa imports here): the code
// mapping is *our* state, not the framework's. Keeping it pure means it unit
// tests without a server, and swapping the in-memory Map for a persistent
// store later touches this file only. See docs/build-breakdown.md 5.1.
//
// Why not just share boardgame.io's matchID? It's a UUID — unreadable over
// voice chat, which is exactly how these rooms get shared ("room WUXIN").
// The UUID stays the wire identity; the code is only a lookup key.
//
// Math.random() is fine in here — this is lobby bookkeeping, NOT game state.
// Anything that touches GState must go through the seeded RNG boardgame.io
// hands the engine (engine/rng.ts), or replays break.

/**
 * Deliberately drops the symbols people mis-hear or mis-type when reading a
 * code aloud: I/1, O/0, S/5, B/8, Z/2, G/6. 24 symbols ^ 5 places ≈ 8.0M
 * codes; collisions are handled by retry below, not by hoping.
 */
export const ROOM_CODE_ALPHABET = 'ACDEFHJKLMNPQRTUVWXY3479';
export const ROOM_CODE_LENGTH = 5;

/** How many times create() will re-roll on a collision before giving up. */
const MAX_CODE_ATTEMPTS = 50;

export interface Room {
  /** Normalized (uppercase, alphabet-only). */
  code: string;
  /** boardgame.io's own match identity — the UUID the client connects with. */
  matchID: string;
  numPlayers: number;
  createdAt: number;
}

export type RandomInt = (maxExclusive: number) => number;

const defaultRandomInt: RandomInt = (maxExclusive) => Math.floor(Math.random() * maxExclusive);

/** Codes are typed by humans: accept lowercase, spaces, dashes. */
export function normalizeRoomCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isWellFormedRoomCode(code: string): boolean {
  return (
    code.length === ROOM_CODE_LENGTH && [...code].every((ch) => ROOM_CODE_ALPHABET.includes(ch))
  );
}

export function generateRoomCode(randomInt: RandomInt = defaultRandomInt): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export interface RoomRegistryOpts {
  randomInt?: RandomInt;
  now?: () => number;
}

/**
 * In-memory code ⇄ match registry. Deliberately matches the lifetime of
 * boardgame.io's default in-memory match store: if the process restarts, the
 * matches are gone anyway, so there is nothing for a persisted code to point
 * at. (A durable DB is a Phase 7 deploy concern — when it lands, this class is
 * the one thing that needs a backing store, and `describeRoom` already handles
 * the "code resolves but the match is gone" case by dropping the code.)
 */
export class RoomRegistry {
  private readonly byCode = new Map<string, Room>();
  private readonly byMatchId = new Map<string, string>();
  private readonly randomInt: RandomInt;
  private readonly now: () => number;

  constructor(opts: RoomRegistryOpts = {}) {
    this.randomInt = opts.randomInt ?? defaultRandomInt;
    this.now = opts.now ?? Date.now;
  }

  get size(): number {
    return this.byCode.size;
  }

  /** Registers a fresh, unused code for an existing match. */
  create(matchID: string, numPlayers: number): Room {
    const existing = this.byMatchId.get(matchID);
    if (existing) {
      throw new Error(`RoomRegistry.create: match ${matchID} already has code ${existing}`);
    }
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateRoomCode(this.randomInt);
      if (this.byCode.has(code)) continue;
      const room: Room = { code, matchID, numPlayers, createdAt: this.now() };
      this.byCode.set(code, room);
      this.byMatchId.set(matchID, code);
      return room;
    }
    throw new Error(
      `RoomRegistry.create: no free room code after ${MAX_CODE_ATTEMPTS} attempts (${this.byCode.size} rooms open)`,
    );
  }

  resolve(rawCode: string): Room | undefined {
    return this.byCode.get(normalizeRoomCode(rawCode));
  }

  /** Points an existing code at a NEW match — the rematch path (7.2). The code
   * is the table's identity for the humans sitting at it ("room WUXIN"), so it
   * must survive the match it was minted for. Refreshes createdAt so prune()
   * measures the room's age from the rematch, not from the first game. */
  rebind(rawCode: string, newMatchID: string): Room | undefined {
    const code = normalizeRoomCode(rawCode);
    const room = this.byCode.get(code);
    if (!room) return undefined;
    const existing = this.byMatchId.get(newMatchID);
    if (existing) {
      throw new Error(`RoomRegistry.rebind: match ${newMatchID} already has code ${existing}`);
    }
    this.byMatchId.delete(room.matchID);
    const next: Room = { ...room, matchID: newMatchID, createdAt: this.now() };
    this.byCode.set(code, next);
    this.byMatchId.set(newMatchID, code);
    return next;
  }

  codeForMatch(matchID: string): string | undefined {
    return this.byMatchId.get(matchID);
  }

  release(rawCode: string): boolean {
    const code = normalizeRoomCode(rawCode);
    const room = this.byCode.get(code);
    if (!room) return false;
    this.byCode.delete(code);
    this.byMatchId.delete(room.matchID);
    return true;
  }

  /** Drops rooms older than `maxAgeMs`; returns the ones removed. Called on a
   * timer from server.ts so an abandoned room's code becomes re-usable. */
  prune(maxAgeMs: number): Room[] {
    const cutoff = this.now() - maxAgeMs;
    const pruned: Room[] = [];
    for (const room of [...this.byCode.values()]) {
      if (room.createdAt < cutoff) {
        this.release(room.code);
        pruned.push(room);
      }
    }
    return pruned;
  }
}
