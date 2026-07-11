// Task 5.1/5.2 — the client's skeleton of the game.
//
// boardgame.io's client needs *a* game object to open a match: the name (it
// must match the server's registration — @3k/shared owns that string), the
// player bounds, and — because the client dispatches a move by name into a
// stage by name — a declaration of which stages accept which moves.
//
// It does NOT need the rules, and must never have them: the browser holding the
// deck, the hidden roles, or the resolution stack is the one thing the whole
// server-authoritative design exists to prevent. So every move here is a no-op
// marked `client: false` — boardgame.io sends it to the master and applies
// nothing locally. The state that comes back is the master's, already filtered
// through playerView. An optimistic local reducer would be worse than useless:
// it would be *wrong*, because the client's G is a stripped view (no draw pile,
// no other hands) and cannot resolve a single rule.
//
// The stage/move names come from @3k/shared's THREE_KINGDOMS_STAGE_MOVES, and
// server/test/bgio/stages.test.ts asserts the real game still matches it — a
// silently-renamed stage is a move that never arrives.

import type { Game, StageConfig } from 'boardgame.io';
import {
  THREE_KINGDOMS_GAME_NAME,
  THREE_KINGDOMS_MAX_PLAYERS,
  THREE_KINGDOMS_MIN_PLAYERS,
  THREE_KINGDOMS_STAGE_MOVES,
} from '@3k/shared';
import type { TableState } from '../game/viewTypes';

/** Never runs: `client: false` means boardgame.io ships the move to the master
 * instead of applying it here. The function only exists because the framework
 * requires a move to *be* something. */
const serverOnly = { move: () => undefined, client: false } as const;

const stages: Record<string, StageConfig<TableState>> = Object.fromEntries(
  Object.entries(THREE_KINGDOMS_STAGE_MOVES).map(([stage, moves]) => [
    stage,
    { moves: Object.fromEntries(moves.map((move) => [move, serverOnly])) },
  ]),
);

export const ThreeKingdomsClientGame: Game<TableState> = {
  name: THREE_KINGDOMS_GAME_NAME,
  minPlayers: THREE_KINGDOMS_MIN_PLAYERS,
  maxPlayers: THREE_KINGDOMS_MAX_PLAYERS,
  turn: { stages },
};
