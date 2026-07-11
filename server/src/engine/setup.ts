// Builds a fresh GState for a new match: role assignment, general selection,
// deck shuffle, opening hand deal, and the initial stack. See
// docs/three-kingdoms-plan.md §2 ("Setup") and docs/engine-design.md §7.
//
// Two entry points, because a match can start from two different places:
//
//   initGame({playerIds, generalIds})  — generals already decided. Used by
//       tests and fixtures that need a specific table, and by any caller that
//       has no selection step.
//   initSelection({playerIds})         — the real thing (task 5.2): roles are
//       dealt and the Lord revealed, but nobody has a general yet. The state
//       sits in a selection window (see engine/selection.ts) until every
//       player has picked, at which point `completeSelection()` deals the
//       opening hands and starts turn 1. This is what the lobby creates.
//
// This module must not import boardgame.io — see docs/engine-design.md §8.

import { generals } from '@3k/shared';
import type { GeneralData } from '@3k/shared';
import type { GState, PlayerId, PlayerState, Role } from './state.js';
import type { RNG } from './rng.js';
import { buildDeck, drawCards, shuffleDeck } from './deck.js';
import { isSelectionComplete, startSelection } from './selection.js';

/** Role counts by player count, Standard edition (plan §2). */
const ROLE_COUNTS: Record<number, Record<Role, number>> = {
  4: { lord: 1, loyalist: 1, rebel: 1, traitor: 1 },
  5: { lord: 1, loyalist: 1, rebel: 2, traitor: 1 },
  6: { lord: 1, loyalist: 1, rebel: 3, traitor: 1 },
  7: { lord: 1, loyalist: 2, rebel: 3, traitor: 1 },
  8: { lord: 1, loyalist: 2, rebel: 4, traitor: 1 },
};

export function roleCountsForPlayerCount(n: number): Readonly<Record<Role, number>> {
  const counts = ROLE_COUNTS[n];
  if (!counts) {
    throw new Error(`roleCountsForPlayerCount: Standard edition supports 4-8 players, got ${n}`);
  }
  return counts;
}

/** Randomly assigns one role per player (including who becomes Lord) per
 * the plan §2 count table. The Lord's role is public from the start
 * (roleRevealed handling is the caller's job, in initGame below); everyone
 * else's is hidden until death. */
export function assignRoles(playerIds: readonly PlayerId[], rng: RNG): Record<PlayerId, Role> {
  const counts = roleCountsForPlayerCount(playerIds.length);
  const pool: Role[] = [];
  for (const role of ['lord', 'loyalist', 'rebel', 'traitor'] as const) {
    for (let i = 0; i < counts[role]; i++) pool.push(role);
  }
  const shuffled = rng.shuffle(pool);
  const assignment: Record<PlayerId, Role> = {};
  playerIds.forEach((id, i) => {
    assignment[id] = shuffled[i];
  });
  return assignment;
}

function getGeneral(id: string): GeneralData {
  const general = generals.find((g) => g.id === id);
  if (!general) throw new Error(`initGame: unknown general id '${id}'`);
  return general;
}

export function lordOf(G: GState): PlayerId {
  const lord = G.seats.find((id) => G.players[id].role === 'lord');
  if (!lord) throw new Error('lordOf: no lord in this game');
  return lord;
}

/** Sets a player's general and the max HP that comes with it. Split out
 * because it happens at two different times: immediately (initGame) or once
 * the player has picked (completeSelection). */
function equipGeneral(player: PlayerState, generalId: string): void {
  const general = getGeneral(generalId);
  player.generalId = generalId;
  player.maxHp = general.maxHp + (player.role === 'lord' ? 1 : 0); // Lord gets +1 max HP (plan §2)
  player.hp = player.maxHp;
}

/** 桃园结义 aside, everyone opens with 4 cards (plan §2, step 3). */
const OPENING_HAND_SIZE = 4;

export interface InitGameOptions {
  /** Seat order — index becomes PlayerState.seat / GState.seats[index]. */
  playerIds: readonly PlayerId[];
  /** One chosen general id per player id. See the scope note above. */
  generalIds: Readonly<Record<PlayerId, string>>;
  /** Fixes the role deal instead of rolling it. A test seam, and deliberately
   * *not* reachable through boardgame.io's `setupData` — that would let anyone
   * who can hit the public match-create endpoint deal themselves the Lord.
   * Tests that need a specific table (who starts, who has +1 max HP) pass this;
   * a real match never does. */
  roles?: Readonly<Record<PlayerId, Role>>;
}

function assertPlayerIds(playerIds: readonly PlayerId[]): void {
  if (playerIds.length < 4 || playerIds.length > 8) {
    throw new Error(`initGame: Standard edition supports 4-8 players, got ${playerIds.length}`);
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error('initGame: duplicate player id in playerIds');
  }
}

/** Roles, seats, a shuffled deck — everything that's true before anyone has a
 * general. Generals, hit points, hands and the first turn are added on top of
 * this by initGame() (immediately) or completeSelection() (once picked). */
function baseState(
  playerIds: readonly PlayerId[],
  rng: RNG,
  fixedRoles?: Readonly<Record<PlayerId, Role>>,
): GState {
  assertPlayerIds(playerIds);
  const roles = fixedRoles ?? assignRoles(playerIds, rng);

  const players: Record<PlayerId, PlayerState> = {};
  playerIds.forEach((id, seat) => {
    const role = roles[id];
    players[id] = {
      id,
      seat,
      role,
      roleRevealed: role === 'lord', // Lord is public from setup; others flip true on death
      generalId: '',
      maxHp: 0,
      hp: 0,
      alive: true,
      hand: [],
      equipment: { weapon: null, armour: null, plusHorse: null, minusHorse: null },
      judgementZone: [],
      flags: {},
    };
  });

  return {
    drawPile: shuffleDeck(buildDeck(), rng),
    discardPile: [],
    players,
    seats: [...playerIds],
    activeSeat: 0,
    turnPhase: 'prep',
    skipPhases: [],
    turnFlags: { strikesPlayed: 0, strikeLimit: 1 },
    stack: [],
    pending: null,
    damage: null,
    demand: null,
    selection: null,
    judgement: null,
    log: [],
  };
}

/** Deals the opening hands and puts the first turn on the stack. Whoever
 * holds the Lord's role takes that first turn (plan §2) — not seat 0, which
 * is just whoever created the room. */
function dealAndStart(G: GState, rng: RNG): void {
  for (const id of G.seats) {
    drawCards(G, id, OPENING_HAND_SIZE, rng);
  }
  G.activeSeat = G.seats.indexOf(lordOf(G));
  G.turnPhase = 'prep';
  G.stack = [{ t: 'phase', phase: 'prep' }];
}

/** Builds a fresh GState with every general already decided: assigns roles,
 * shuffles the deck, deals opening hands, and seeds the stack with the first
 * turn's prep phase. Does not run `pump()` — that's the caller's job (the bgio
 * adapter's setup(), task 2.3), since only the adapter has an RNG backed by
 * boardgame.io's seeded random. */
export function initGame(opts: InitGameOptions, rng: RNG): GState {
  const { playerIds, generalIds, roles } = opts;
  const G = baseState(playerIds, rng, roles);

  for (const id of playerIds) {
    const generalId = generalIds[id];
    if (!generalId) throw new Error(`initGame: no general chosen for player ${id}`);
    equipGeneral(G.players[id], generalId);
  }

  dealAndStart(G, rng);
  return G;
}

/** Builds a fresh GState that is *waiting on general selection* (task 5.2):
 * roles are dealt, the Lord is revealed, candidates are dealt — and nothing
 * else has happened. No hands, no hit points, an empty stack. The game
 * proceeds when completeSelection() is called (the bgio adapter does that as
 * soon as the last player picks). */
export function initSelection(opts: { playerIds: readonly PlayerId[] }, rng: RNG): GState {
  const G = baseState(opts.playerIds, rng);
  G.selection = startSelection(G.seats, lordOf(G), rng);
  return G;
}

/** Applies everyone's picks, deals the opening hands, and starts turn 1 with
 * the Lord. Throws if anyone is still choosing — the caller (the chooseGeneral
 * move) is what decides that, and calling this early would deal a table with a
 * general-less player in it. */
export function completeSelection(G: GState, rng: RNG): void {
  const selection = G.selection;
  if (!selection) throw new Error('completeSelection: no selection in progress');
  if (!isSelectionComplete(selection)) {
    throw new Error(
      `completeSelection: still waiting on ${selection.awaiting.join(', ')} to pick a general`,
    );
  }

  for (const id of G.seats) {
    const generalId = selection.picked[id];
    if (!generalId) throw new Error(`completeSelection: player ${id} never picked a general`);
    equipGeneral(G.players[id], generalId);
  }

  G.selection = null;
  dealAndStart(G, rng);
}
