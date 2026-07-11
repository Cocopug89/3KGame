// Integration tests for the boardgame.io adapter — task 2.3 (the act/discard
// turn loop) and task 2.8 (the full 杀/闪/桃/濒死 loop end to end). Runs the
// real framework locally (no server/socket) via `boardgame.io/client`,
// driving moves as different players the way a real client would — this is
// the thing unit tests constructing a bare GState can't catch: whether
// `turn.stages`/`events.setActivePlayers`/`events.endTurn` are actually
// wired correctly against boardgame.io's own reducer, not just whether the
// engine's own logic is right in isolation.
//
// A note on why this reads state "as the active player" throughout: G goes
// through `playerView` (docs/engine-design.md §6) before this test ever
// sees it, same as a real client. Without a playerID set, `getState()` is a
// spectator view — every player's `hand` is stripped to `handCount`,
// including the "no one is me" case. That's the point of playerView, not a
// bug, but it means this test has to `updatePlayerID` to whoever is
// currently pending before it can read *that* player's own hand.
//
// Task 2.8's scenario tests rig the *deal* (see `riggedClient` below) rather
// than the engine: the real setup() runs, then specific cards are moved from
// the draw pile into specific hands and hp is set, so a lethal 杀 is one
// move away instead of twenty turns away. Everything after that — every
// move, stage transition, pump() call — is the real thing.
//
// Deep import — see server/src/boardgame-io-server.d.ts for why (no
// "exports" map on this package).
import { Client } from 'boardgame.io/dist/cjs/client.js';
import { describe, it, expect } from 'vitest';
import { cards } from '@3k/shared';
import { generals } from '@3k/shared';
import { ThreeKingdomsGame } from '../../src/bgio/game.js';
import { makeRng, type BgioRandomLike } from '../../src/bgio/rng.js';
import { initGame, roleCountsForPlayerCount } from '../../src/engine/setup.js';
import { pump } from '../../src/engine/pump.js';
import type { CardId, GState, PlayerId, Role } from '../../src/engine/state.js';

interface ViewPlayer {
  hand?: string[];
  handCount?: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  role?: string;
  roleRevealed: boolean;
  equipment: Record<string, string | null>;
  judgementZone: string[];
}

interface ViewState {
  drawPileCount: number;
  discardPile: string[];
  players: Record<PlayerId, ViewPlayer>;
  activeSeat: number;
  seats: PlayerId[];
  turnPhase: string;
  turnFlags: { strikesPlayed: number; strikeLimit: number };
  pending: {
    playerId?: PlayerId;
    waitingOn?: PlayerId;
    kind: string;
    count?: number;
    target?: PlayerId;
  } | null;
}

interface BgClient {
  start(): void;
  stop(): void;
  updatePlayerID(id: PlayerId): void;
  moves: Record<string, (...args: unknown[]) => void>;
  getState(): {
    G: ViewState;
    ctx: { currentPlayer: PlayerId; activePlayers: Record<PlayerId, string> | null };
  } | null;
}

const effectKeyOf = new Map<string, string>(cards.map((c) => [c.id, c.effectKey]));
const idsOf = (effectKey: string): CardId[] =>
  cards.filter((c) => c.effectKey === effectKey).map((c) => c.id);

const STRIKES = idsOf('strike');
const DODGES = idsOf('dodge');
const PEACHES = idsOf('peach');

/** Cards visible for a player in a playerView-shaped state: the owner has
 * `hand`, everyone else has `handCount` (docs/engine-design.md §6). */
function handSize(p: ViewPlayer): number {
  return p.hand ? p.hand.length : (p.handCount ?? 0);
}

function totalCards(G: ViewState): number {
  const hands = Object.values(G.players).reduce((n, p) => n + handSize(p), 0);
  const equipment = Object.values(G.players).reduce(
    (n, p) => n + Object.values(p.equipment).filter(Boolean).length,
    0,
  );
  const judgement = Object.values(G.players).reduce((n, p) => n + p.judgementZone.length, 0);
  return G.drawPileCount + G.discardPile.length + hands + equipment + judgement;
}

// ── task 2.8: rigging the deal ────────────────────────────────────────────
//
// A test-only wrapper: the real game (same moves, same stages, same
// playerView, same pump) with a setup() that runs the real one and then
// deterministically re-deals. Cards are *moved between zones*, never
// invented, so the 107-card conservation invariant every test below asserts
// still holds from the first frame.

interface Rig {
  /** Exact hand for each player. All hands are cleared first, so a player
   * omitted here holds nothing — that's what makes "nobody can save you"
   * scenarios deterministic. */
  hands: Record<PlayerId, CardId[]>;
  hp?: Record<PlayerId, number>;
  /** Defaults to testRoles() — player '0' is the Lord and takes turn 1. */
  roles?: Record<PlayerId, Role>;
}

function applyRig(G: GState, rig: Rig): void {
  for (const p of Object.values(G.players)) {
    G.drawPile.push(...p.hand);
    p.hand = [];
  }
  for (const [playerId, hand] of Object.entries(rig.hands)) {
    for (const cardId of hand) {
      const i = G.drawPile.indexOf(cardId);
      if (i === -1) throw new Error(`rig: '${cardId}' is not in the draw pile`);
      G.drawPile.splice(i, 1);
      G.players[playerId].hand.push(cardId);
    }
  }
  for (const [playerId, hp] of Object.entries(rig.hp ?? {})) {
    G.players[playerId].hp = hp;
  }
}

/** A fixed role deal, so the table these tests describe is the table they get.
 * Player '0' is the Lord — which, since task 5.2, is also who takes the first
 * turn (plan §2: the Lord starts, not seat 0). Rolling the roles instead would
 * make both *who acts first* and *who has +1 max HP* a function of the seed. */
function testRoles(numPlayers: number): Record<PlayerId, Role> {
  const counts = roleCountsForPlayerCount(numPlayers);
  const pool: Role[] = [];
  for (const role of ['lord', 'loyalist', 'rebel', 'traitor'] as const) {
    for (let i = 0; i < counts[role]; i++) pool.push(role);
  }
  const roles: Record<PlayerId, Role> = {};
  pool.forEach((role, i) => {
    roles[String(i)] = role;
  });
  return roles;
}

/** The first N generals, in player order — the same default the real setup()
 * uses when no general selection is asked for (task 5.2 made selection opt-in
 * via setupData precisely so tests can keep dealing a known table). */
function testGeneralIds(playerIds: readonly PlayerId[]): Record<PlayerId, string> {
  const assignment: Record<PlayerId, string> = {};
  playerIds.forEach((id, i) => {
    assignment[id] = generals[i].id;
  });
  return assignment;
}

function riggedClient(rig: Rig, numPlayers = 4): BgClient {
  const game = {
    ...ThreeKingdomsGame,
    // Same engine, same moves, same stages, same playerView, same pump — only
    // the deal is fixed: known roles, known generals, then cards *moved*
    // between zones (never invented), so the 107-card conservation invariant
    // holds from the first frame.
    setup: ({ ctx, random }: { ctx: { numPlayers: number }; random: unknown }) => {
      const playerIds: PlayerId[] = Array.from({ length: ctx.numPlayers }, (_, i) => String(i));
      const rng = makeRng(random as BgioRandomLike);
      const G = initGame(
        {
          playerIds,
          generalIds: testGeneralIds(playerIds),
          roles: rig.roles ?? testRoles(ctx.numPlayers),
        },
        rng,
      );
      pump(G, rng);
      applyRig(G, rig);
      return G;
    },
  };
  const client = Client({ game, numPlayers }) as unknown as BgClient;
  client.start();
  return client;
}

/** Task 5.3 gave the match a terminal state: once someone has WON, `pump()`
 * halts, `endIf` closes the game and nothing is pending — by design. Every
 * drive loop below therefore has to be able to stop, and "nothing is pending"
 * is only a bug while the game is still on. */
function isOver(client: BgClient): boolean {
  return Boolean(client.getState()?.G.gameOver);
}

/** Switches the client to whoever G.pending currently names and re-reads
 * state from that player's own point of view (so `pending.playerId` and,
 * if it's their own, `hand` are populated rather than stripped). */
function readAsPendingPlayer(client: BgClient) {
  const peek = client.getState();
  if (!peek) throw new Error('readAsPendingPlayer: no state');
  const activeId = peek.G.pending?.playerId ?? peek.G.pending?.waitingOn;
  if (!activeId) throw new Error('readAsPendingPlayer: nothing pending');
  client.updatePlayerID(activeId);
  const state = client.getState();
  if (!state) throw new Error('readAsPendingPlayer: no state after updatePlayerID');
  return state;
}

/** Reads the game as some *other* player — i.e. through the same playerView
 * a real opponent gets. */
function readAs(client: BgClient, playerId: PlayerId) {
  client.updatePlayerID(playerId);
  const state = client.getState();
  if (!state) throw new Error('readAs: no state');
  return state;
}

/** Every invariant that must hold after any move, at any point in any game.
 * Called on every step of every drive loop below. */
function expectInvariants(client: BgClient): void {
  const { G, ctx } = readAsPendingPlayer(client);
  expect(totalCards(G)).toBe(107); // no card is ever created or destroyed
  expect(G.pending).not.toBeNull();
  // Whatever the engine says is pending must be exactly who bgio thinks is
  // active, in exactly that stage — every single step, not just at turn
  // boundaries.
  expect(ctx.currentPlayer).toBe(G.seats[G.activeSeat]);
  expect(ctx.activePlayers).toEqual({ [G.pending!.playerId!]: G.pending!.kind });
  // The engine never asks a dead player for anything, and never leaves a
  // living player at hp <= 0 outside an open dying window.
  expect(G.players[G.pending!.playerId!].alive).toBe(true);
  for (const p of Object.values(G.players)) {
    expect(p.hp).toBeLessThanOrEqual(p.maxHp);
    if (p.alive && !isDyingWindow(G)) {
      expect(p.hp).toBeGreaterThan(0);
    }
  }
}

/** A 桃 demand IS the dying window (4.1b: respondPeach was retired into the
 * generic demand protocol), and it is the one moment a living player may sit at
 * 0 hp. */
function isDyingWindow(G: ViewState): boolean {
  return G.pending!.kind === 'demandCard' && G.pending!.demandKind === 'peach';
}

// ── task 2.8: the scripted player ─────────────────────────────────────────

/** Living players in seat order — the circle 杀's range-1 default measures
 * over (docs/engine-design.md §7, engine/distance.ts). No equipment is
 * playable in Phase 2 (the effect registry has no weapon entries yet), so
 * everyone's attack range is exactly 1: their two living neighbours. */
function neighboursOf(G: ViewState, me: PlayerId): PlayerId[] {
  const order = G.seats.filter((id) => G.players[id].alive);
  const n = order.length;
  if (n < 2) return [];
  const i = order.indexOf(me);
  return [...new Set([order[(i + 1) % n], order[(i - 1 + n) % n]])].filter((id) => id !== me);
}

const findCard = (hand: readonly CardId[], effectKey: string): CardId | undefined =>
  hand.find((id) => effectKeyOf.get(id) === effectKey);

/**
 * An aggressive-but-legal scripted player: strike a neighbour whenever the
 * strike limit allows, heal when hurt, always dodge if able, always eat a
 * peach rather than die. Drives one pending request and returns what it did.
 */
function driveOneRequest(client: BgClient): string {
  const { G } = readAsPendingPlayer(client);
  const pending = G.pending!;
  const me = pending.playerId;
  if (!me) throw new Error('driveOneRequest: pending.playerId missing after switching view');
  const hand = G.players[me].hand;
  if (!hand) throw new Error('driveOneRequest: own hand missing even after switching view');

  switch (pending.kind) {
    case 'act': {
      const strike = findCard(hand, 'strike');
      const targets = neighboursOf(G, me);
      if (strike && targets.length > 0 && G.turnFlags.strikesPlayed < G.turnFlags.strikeLimit) {
        client.moves.playCard(strike, [targets[0]]);
        return 'strike';
      }
      const peach = findCard(hand, 'peach');
      if (peach && G.players[me].hp < G.players[me].maxHp) {
        client.moves.playCard(peach, []);
        return 'peach';
      }
      client.moves.pass();
      return 'pass';
    }
    case 'discard':
      client.moves.discard(hand.slice(0, pending.count));
      return 'discard';
    // 4.1b: 闪 and 桃 are both DEMANDS now (skill-trigger-design §5), which is
    // why this driver has one case where it used to have two.
    case 'demandCard': {
      const kind = pending.demandKind as string;
      const card = findCard(hand, kind);
      // The engine only ever raises a demand it believes can be answered
      // ({t:'demandAsk'} folds queries.cardsAs over the hand first), so a
      // missing card here would be an engine bug, not a legal "decline".
      if (!card) throw new Error(`driveOneRequest: demand for a ${kind} raised at a player who has none`);
      client.moves.supplyCards([card]);
      return kind === 'peach' ? 'save' : 'dodge';
    }
    default:
      throw new Error(`driveOneRequest: don't know how to drive request kind '${pending.kind}'`);
  }
}

describe('ThreeKingdomsGame (bgio adapter)', () => {
  it('deals a legal opening state with the active player waiting in the act stage', () => {
    const client = Client({ game: ThreeKingdomsGame, numPlayers: 4 }) as unknown as BgClient;
    client.start();

    const { G, ctx } = readAsPendingPlayer(client);
    expect(Object.keys(G.players)).toHaveLength(4);
    expect(totalCards(G)).toBe(107);
    expect(G.pending).not.toBeNull();
    expect(G.pending!.kind).toBe('act');
    // The active player is whoever G.pending names, and bgio's own
    // currentPlayer/activePlayers must already agree — this is the part a
    // bare-GState unit test can't verify, only exercising the real
    // framework can.
    expect(ctx.currentPlayer).toBe(G.pending!.playerId);
    expect(ctx.activePlayers).toEqual({ [G.pending!.playerId!]: 'act' });

    client.stop();
  });

  it('drives several turns end-to-end, keeping bgio ctx and G.pending in sync throughout', () => {
    const client = Client({ game: ThreeKingdomsGame, numPlayers: 4 }) as unknown as BgClient;
    client.start();

    const seenPlayers = new Set<PlayerId>();
    for (let i = 0; i < 40; i++) {
      const before = readAsPendingPlayer(client);
      const kind = before.G.pending!.kind;
      const playerId = before.G.pending!.playerId!;
      seenPlayers.add(playerId);

      driveOneRequest(client);
      expectInvariants(client);

      // Hand limit is respected the instant a discard resolves.
      if (kind === 'discard') {
        const p = readAs(client, playerId).G.players[playerId];
        expect(handSize(p)).toBeLessThanOrEqual(p.hp);
      }
    }

    // 4 players — the turn should have rotated through more than just
    // player 0.
    expect(seenPlayers.size).toBeGreaterThan(1);

    client.stop();
  });

  // ── task 2.8: the full 杀/闪/桃/濒死 loop, through the real framework ────

  it('杀 → 闪: the target is pulled into the demandCard stage mid-turn, and a real 闪 stops the damage', () => {
    const client = riggedClient({ hands: { '0': [STRIKES[0]], '1': [DODGES[0]] } });

    const start = readAsPendingPlayer(client); // '0', act
    const hpBefore = start.G.players['1'].hp;
    client.moves.playCard(STRIKES[0], ['1']);

    // The striker keeps the bgio *turn*; the target is pulled into a stage.
    // Getting this wrong (e.g. by ending the turn to hand over control) is
    // exactly the class of bug only the real framework surfaces.
    const asked = readAsPendingPlayer(client);
    expect(asked.G.pending!.kind).toBe('demandCard');
    expect(asked.G.pending!.demandKind).toBe('dodge');
    expect(asked.G.pending!.playerId).toBe('1');
    expect(asked.ctx.currentPlayer).toBe('0');
    expect(asked.ctx.activePlayers).toEqual({ '1': 'demandCard' });
    expectInvariants(client);

    client.moves.supplyCards([DODGES[0]]);

    const after = readAsPendingPlayer(client);
    expect(after.G.players['1'].hp).toBe(hpBefore); // 闪 ⇒ no damage
    expect(after.G.discardPile).toContain(STRIKES[0]);
    expect(after.G.discardPile).toContain(DODGES[0]);
    // Control returns to the striker's *action phase* — not the next phase,
    // and not the next player.
    expect(after.G.pending!.kind).toBe('act');
    expect(after.G.pending!.playerId).toBe('0');
    expect(after.ctx.activePlayers).toEqual({ '0': 'act' });
    expectInvariants(client);

    client.stop();
  });

  it('杀 → declined 闪: damage lands and the striker keeps the floor', () => {
    const client = riggedClient({ hands: { '0': [STRIKES[0]], '1': [DODGES[0]] } });

    const hpBefore = readAsPendingPlayer(client).G.players['1'].hp;
    client.moves.playCard(STRIKES[0], ['1']);

    // The target CAN answer, so they are asked — and decline. (A target who
    // could not answer at all is never asked: {t:'demandAsk'} folds cardsAs
    // over their hand first. That is the next test.)
    expect(readAsPendingPlayer(client).G.pending!.kind).toBe('demandCard');
    client.moves.supplyCards(); // no cards = decline

    const after = readAsPendingPlayer(client);
    expect(after.G.players['1'].hp).toBe(hpBefore - 1);
    expect(after.G.players['1'].alive).toBe(true);
    expect(after.G.pending).toEqual({ kind: 'act', playerId: '0' });
    expectInvariants(client);

    client.stop();
  });

  it('杀 at a target who cannot answer: no prompt at all, the damage just lands (4.1b)', () => {
    const client = riggedClient({ hands: { '0': [STRIKES[0]], '1': [] } });

    const hpBefore = readAsPendingPlayer(client).G.players['1'].hp;
    client.moves.playCard(STRIKES[0], ['1']);

    // The server knows every hand: an un-answerable prompt is a wasted
    // round-trip, not fairness. And because the demand.open fan-out runs
    // BEFORE this check (§12.2), a proxy supplier (护驾) or a deemed 闪 (八卦阵)
    // will still be able to make this demand answerable when they exist.
    const after = readAsPendingPlayer(client);
    expect(after.G.players['1'].hp).toBe(hpBefore - 1);
    expect(after.G.pending).toEqual({ kind: 'act', playerId: '0' });
    expectInvariants(client);

    client.stop();
  });

  it('lethal 杀 → 濒死: the dying player is asked for a 桃 and saves themselves', () => {
    const client = riggedClient({
      hands: { '0': [STRIKES[0]], '1': [PEACHES[0]], '2': [], '3': [] },
      hp: { '1': 1 },
    });

    // '1' may have been randomly dealt the Lord role, which is public from
    // setup (engine/setup.ts) — so "surviving means no role reveal" has to
    // be asserted against what was already true, not against `false`.
    const revealedBefore = readAsPendingPlayer(client).G.players['1'].roleRevealed;
    client.moves.playCard(STRIKES[0], ['1']); // '1' holds no 闪 ⇒ never asked, hp 1 → 0
    client.updatePlayerID('1');

    const dying = readAsPendingPlayer(client);
    expect(dying.G.pending!.kind).toBe('demandCard');
    expect(dying.G.pending!.demandKind).toBe('peach');
    expect(dying.G.pending!.playerId).toBe('1'); // offset 0 = the dying player
    expect(dying.G.pending!.subject).toBe('1'); // …and who the 桃 is FOR
    expect(dying.G.players['1'].hp).toBe(0);
    expect(dying.G.players['1'].alive).toBe(true); // the window is still open
    expect(dying.ctx.currentPlayer).toBe('0'); // still the striker's turn
    expectInvariants(client);

    client.moves.supplyCards([PEACHES[0]]);

    const saved = readAsPendingPlayer(client);
    expect(saved.G.players['1'].hp).toBe(1);
    expect(saved.G.players['1'].alive).toBe(true);
    expect(saved.G.players['1'].roleRevealed).toBe(revealedBefore); // survived ⇒ no reveal
    expect(saved.G.discardPile).toContain(PEACHES[0]);
    expect(saved.G.pending).toEqual({ kind: 'act', playerId: '0' }); // striker acts on
    expectInvariants(client);

    client.stop();
  });

  it('lethal 杀 → nobody holds a 桃: the player dies, is stripped of cards, has their role revealed, and their seat is skipped forever after', () => {
    // Nobody holds anything except the striker's 杀 — so the dying window
    // walks every living player, finds no 桃, and closes with a death.
    const client = riggedClient({
      hands: { '0': [STRIKES[0]], '1': [], '2': [], '3': [] },
      hp: { '1': 1 },
    });

    const discardBefore = readAsPendingPlayer(client).G.discardPile.length;
    client.moves.playCard(STRIKES[0], ['1']);
    client.updatePlayerID('1');

    // No demandCard request is ever raised — neither for the 闪 nor for the 桃:
    // {t:'demandAsk'} walks straight past everyone who cannot answer instead of
    // asking them.
    const dead = readAsPendingPlayer(client);
    expect(dead.G.pending).toEqual({ kind: 'act', playerId: '0' }); // straight back to the striker
    expect(dead.G.players['1'].alive).toBe(false);
    expect(dead.G.players['1'].roleRevealed).toBe(true);
    expect(handSize(dead.G.players['1'])).toBe(0);
    expect(dead.G.discardPile.length).toBe(discardBefore + 1); // just the 杀 (the hand was empty)
    expectInvariants(client);

    // A dead player's role becomes public — playerView must now show it to
    // everyone, not only to themselves (docs/engine-design.md §6).
    const asOpponent = readAs(client, '2');
    expect(asOpponent.G.players['1'].role).toBeDefined();
    expect(asOpponent.G.players['1'].alive).toBe(false);

    // The dead seat is skipped, not compacted: play goes 0 → 2 → 3, and '1'
    // is never asked for anything again.
    const seenAfterDeath = new Set<PlayerId>();
    for (let i = 0; i < 30 && !isOver(client); i++) {
      seenAfterDeath.add(readAsPendingPlayer(client).G.pending!.playerId!);
      driveOneRequest(client);
      expectInvariants(client);
    }
    expect(seenAfterDeath.has('1')).toBe(false);
    expect(seenAfterDeath.has('2')).toBe(true);
    expect(seenAfterDeath.has('3')).toBe(true);
    expect(readAsPendingPlayer(client).G.players['1'].alive).toBe(false); // stays dead

    client.stop();
  });

  it('plays a whole game out with scripted players: strikes, dodges, peaches, deaths — the loop never wedges', () => {
    // The real deal (not rigged), driven by the aggressive scripted player
    // above until someone actually dies of 杀 damage across real turns. This
    // is the "playable end to end" check: no soft-lock, no illegal state, no
    // card leaks, over hundreds of moves and at least one death.
    const client = Client({ game: ThreeKingdomsGame, numPlayers: 4 }) as unknown as BgClient;
    client.start();

    const actions = new Set<string>();
    let deaths = 0;
    let steps = 0;

    for (; steps < 600; steps++) {
      const before = readAsPendingPlayer(client);
      const aliveBefore = Object.values(before.G.players).filter((p) => p.alive).length;

      actions.add(driveOneRequest(client));

      // The match can now actually END (task 5.3): G.gameOver stops the engine,
      // and there is nothing pending to drive or to assert invariants about.
      if (isOver(client)) {
        deaths +=
          aliveBefore - Object.values(client.getState()!.G.players).filter((p) => p.alive).length;
        break;
      }
      expectInvariants(client);

      const after = readAsPendingPlayer(client);
      const aliveAfter = Object.values(after.G.players).filter((p) => p.alive).length;
      deaths += aliveBefore - aliveAfter;

      // Stop once the loop has proven it survives a death and keeps running
      // with fewer players than it started with.
      if (deaths > 0 && steps > 80) break;
    }

    expect(deaths).toBeGreaterThan(0);
    // Every branch of the Phase 2 rules actually got exercised, not just the
    // pass/discard skeleton.
    expect(actions).toContain('strike');
    expect(actions).toContain('dodge');
    expect(actions).toContain('pass');
    // 'no-dodge' is gone as of 4.1b, and its absence is the point: a target who
    // cannot produce a 闪 is never asked at all, so "declining" is no longer a
    // thing the scripted player can do. Strikes still land undodged — that is
    // what `deaths > 0` above proves.

    // Two legal endings now that a match can actually BE won (task 5.3): the
    // loop stopped mid-game (⇒ still playable, nothing wedged), or the scripted
    // players finished it (⇒ boardgame.io is closed and nothing is pending, and
    // that is not a soft-lock — it's a result).
    const final = client.getState()!;
    if (final.G.gameOver) {
      expect(final.ctx.gameover).toEqual(final.G.gameOver);
    } else {
      const end = readAsPendingPlayer(client);
      expect(Object.values(end.G.players).filter((p) => p.alive).length).toBeLessThan(4);
      expect(end.G.pending).not.toBeNull(); // still playable, no soft-lock
      expect(end.G.pending!.playerId).toBeDefined();
    }

    client.stop();
  });
});
