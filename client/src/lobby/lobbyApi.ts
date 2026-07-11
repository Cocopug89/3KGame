// Task 5.1 — the client half of the lobby.
//
// Two servers' worth of endpoints, on purpose (see server/src/lobby/rooms.ts):
// creating a room and resolving a code are ours; joining and leaving are
// boardgame.io's own lobby endpoints, called through its LobbyClient so the
// credentials it mints are the ones the socket master will accept.

import { LobbyClient } from 'boardgame.io/client';
import { THREE_KINGDOMS_GAME_NAME } from '@3k/shared';
import { LOBBY_URL } from './serverUrl';

export interface Seat {
  seat: number;
  playerID: string;
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

/** Carries the i18n key the UI should show — never a raw server string. */
export class LobbyError extends Error {
  constructor(readonly i18nKey: string) {
    super(i18nKey);
    this.name = 'LobbyError';
  }
}

const lobbyClient = new LobbyClient({ server: LOBBY_URL });

async function readRoom(res: Response): Promise<RoomSummary> {
  if (res.status === 404) throw new LobbyError('lobby.error.room_not_found');
  if (!res.ok) throw new LobbyError('lobby.error.server');
  return (await res.json()) as RoomSummary;
}

export async function createRoom(numPlayers: number): Promise<RoomSummary> {
  const res = await fetch(`${LOBBY_URL}/rooms?numPlayers=${numPlayers}`, { method: 'POST' }).catch(
    () => {
      throw new LobbyError('lobby.error.network');
    },
  );
  return readRoom(res);
}

export async function fetchRoom(code: string): Promise<RoomSummary> {
  const res = await fetch(`${LOBBY_URL}/rooms/${encodeURIComponent(code)}`).catch(() => {
    throw new LobbyError('lobby.error.network');
  });
  return readRoom(res);
}

export interface JoinResult {
  playerID: string;
  credentials: string;
}

export async function joinSeat(
  matchID: string,
  playerID: string,
  playerName: string,
): Promise<JoinResult> {
  try {
    const { playerCredentials } = await lobbyClient.joinMatch(THREE_KINGDOMS_GAME_NAME, matchID, {
      playerID,
      playerName,
    });
    return { playerID, credentials: playerCredentials };
  } catch {
    // 409 from boardgame.io = somebody took that seat between the poll and
    // the click. It's the one failure a player will actually hit.
    throw new LobbyError('lobby.error.seat_taken');
  }
}

export async function leaveSeat(
  matchID: string,
  playerID: string,
  credentials: string,
): Promise<void> {
  try {
    await lobbyClient.leaveMatch(THREE_KINGDOMS_GAME_NAME, matchID, { playerID, credentials });
  } catch {
    throw new LobbyError('lobby.error.server');
  }
}

// ── session (survives a refresh) ────────────────────────────────────────
// Credentials in localStorage are what let a refreshed tab re-attach to its
// seat instead of orphaning it (task 5.3).
//
// RE-ATTACH, NEVER RE-JOIN. boardgame.io's `/leave` wipes a match once its last
// named player has left it (5.1's inherited edge), and a second joinMatch on a
// seat you already hold is a 409 — so a refresh must reconnect the socket with
// the credentials it already minted, which is exactly what this record is for.
// Nothing in the reconnect path calls joinSeat() or leaveSeat(); the only call
// to leaveSeat() left is the explicit "Leave room" button, which is offered
// before the game starts and nowhere else.

export interface LobbySession {
  roomCode: string;
  matchID: string;
  playerID: string;
  playerName: string;
  credentials: string;
  /** Already at the table (task 5.3): a refresh mid-match goes straight back to
   * the socket rather than to the seat list — the room's seat view is only
   * interesting before the deal, and bouncing a returning player through it
   * invites them to press "Leave", which would destroy the match they're in. */
  atTable?: boolean;
}

const SESSION_KEY = '3k-session';

export function loadSession(): LobbySession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LobbySession>;
    if (!parsed.matchID || !parsed.playerID || !parsed.credentials || !parsed.roomCode) return null;
    return parsed as LobbySession;
  } catch {
    return null;
  }
}

export function saveSession(session: LobbySession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
