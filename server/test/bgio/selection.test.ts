// Task 5.2 — general selection driven through the *real* boardgame.io
// framework, the way a lobby-created match runs it (setupData.selectGenerals).
//
// The engine's own rules are unit-tested in test/engine/selection.test.ts.
// What only the framework can tell us, and what this file is for:
//   • that several players really are in the chooseGeneral stage at once (the
//     one window in the game that isn't single-pending), and that bgio accepts
//     a move from a player who isn't ctx.currentPlayer;
//   • that playerView never shows a player another player's candidates or an
//     unrevealed pick — the leak 5.4 audits for, tested here at the source;
//   • that the last pick starts the game: hands dealt, turn 1 on the Lord.

import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/dist/cjs/client.js';
import { ThreeKingdomsGame } from '../../src/bgio/game.js';
import type { PlayerId } from '../../src/engine/state.js';

interface SelectionView {
  lord: PlayerId;
  awaiting: PlayerId[];
  candidates: string[];
  lockedIn: PlayerId[];
  lordGeneralId: string | null;
  myPick: string | null;
}

interface ViewState {
  players: Record<PlayerId, { hand?: string[]; handCount?: number; generalId: string; hp: number; maxHp: number; role?: string }>;
  seats: PlayerId[];
  activeSeat: number;
  drawPileCount: number;
  pending: { kind: string; playerId?: PlayerId; waitingOn?: PlayerId } | null;
  selection: SelectionView | null;
}

interface BgClient {
  start(): void;
  updatePlayerID(id: PlayerId | null): void;
  moves: Record<string, (...args: unknown[]) => void>;
  getState(): {
    G: ViewState;
    ctx: { currentPlayer: PlayerId; activePlayers: Record<PlayerId, string> | null };
  } | null;
}

type SetupFn = (fnCtx: unknown, setupData: unknown) => unknown;
const realSetup = ThreeKingdomsGame.setup as unknown as SetupFn;

/** boardgame.io's *local* Client has no way to pass setupData (only the server's
 * match-create path does — that's the lobby, and test/lobby/rooms.test.ts covers
 * it). So the harness supplies it the only way it can: by wrapping setup(). The
 * game under test is otherwise the real one — same moves, same stages, same
 * playerView. */
function selectingClient(numPlayers = 4): BgClient {
  const game = {
    ...ThreeKingdomsGame,
    setup: (fnCtx: unknown) => realSetup(fnCtx, { selectGenerals: true }),
  };
  const client = Client({ game, numPlayers }) as unknown as BgClient;
  client.start();
  return client;
}

function readAs(client: BgClient, playerId: PlayerId) {
  client.updatePlayerID(playerId);
  const state = client.getState();
  if (!state) throw new Error('readAs: no state');
  return state;
}

/** The lord, read from any seat — their role is public from setup. */
function lordOf(client: BgClient): PlayerId {
  const { G } = readAs(client, '0');
  return G.selection!.lord;
}

function pick(client: BgClient, playerId: PlayerId, generalId: string) {
  client.updatePlayerID(playerId);
  client.moves.chooseGeneral(generalId);
}

/** Everyone picks their first candidate, Lord first. Returns who picked what. */
function everyonePicks(client: BgClient): Record<PlayerId, string> {
  const lord = lordOf(client);
  const picks: Record<PlayerId, string> = {};

  const lordView = readAs(client, lord);
  picks[lord] = lordView.G.selection!.candidates[0];
  pick(client, lord, picks[lord]);

  for (const id of lordView.G.seats.filter((s) => s !== lord)) {
    const view = readAs(client, id);
    picks[id] = view.G.selection!.candidates[0];
    pick(client, id, picks[id]);
  }
  return picks;
}

describe('general selection through boardgame.io', () => {
  it('opens with only the Lord in the chooseGeneral stage', () => {
    const client = selectingClient();
    const lord = lordOf(client);
    const { G, ctx } = readAs(client, lord);

    expect(G.selection!.awaiting).toEqual([lord]);
    expect(ctx.activePlayers).toEqual({ [lord]: 'chooseGeneral' });
    expect(G.pending).toBeNull(); // selection is not a pending request
    expect(G.drawPileCount).toBe(107); // nothing dealt yet
  });

  it('puts every other player in the stage at once, the moment the Lord reveals', () => {
    const client = selectingClient(5);
    const lord = lordOf(client);
    const lordView = readAs(client, lord);
    const others = lordView.G.seats.filter((s) => s !== lord);

    pick(client, lord, lordView.G.selection!.candidates[0]);

    const { G, ctx } = readAs(client, others[0]);
    expect([...G.selection!.awaiting].sort()).toEqual([...others].sort());
    expect(ctx.activePlayers).toEqual(
      Object.fromEntries(others.map((id) => [id, 'chooseGeneral'])),
    );
    // The whole point of Lord-first: everyone else chooses knowing who the
    // Lord is playing.
    expect(G.selection!.lordGeneralId).toBe(lordView.G.selection!.candidates[0]);
  });

  it('shows a player their own candidates and nobody else’s', () => {
    const client = selectingClient();
    const lord = lordOf(client);
    const other = readAs(client, lord).G.seats.find((s) => s !== lord)!;

    const mine = readAs(client, lord).G.selection!.candidates;
    const theirs = readAs(client, other).G.selection!.candidates;

    expect(mine).toHaveLength(5); // the Lord's wider pool
    expect(theirs).toHaveLength(3);
    expect(mine.some((g) => theirs.includes(g))).toBe(false);

    // A spectator (no playerID) gets no candidates at all.
    client.updatePlayerID(null);
    expect(client.getState()!.G.selection!.candidates).toEqual([]);
  });

  it('hides an ordinary player’s pick until selection ends — only the fact that they locked in', () => {
    const client = selectingClient();
    const lord = lordOf(client);
    const seats = readAs(client, lord).G.seats;
    const [a, b] = seats.filter((s) => s !== lord);

    pick(client, lord, readAs(client, lord).G.selection!.candidates[0]);
    const aPick = readAs(client, a).G.selection!.candidates[0];
    pick(client, a, aPick);

    const asB = readAs(client, b).G;
    expect(asB.selection!.lockedIn).toContain(a);
    expect(JSON.stringify(asB.selection)).not.toContain(aPick); // the choice itself stays secret
    expect(asB.selection!.myPick).toBeNull();

    const asA = readAs(client, a).G;
    expect(asA.selection!.myPick).toBe(aPick); // …but you can see your own
  });

  it('refuses a pick that is not yours to make', () => {
    const client = selectingClient();
    const lord = lordOf(client);
    const seats = readAs(client, lord).G.seats;
    const other = seats.find((s) => s !== lord)!;

    // Before the Lord has revealed, nobody else may pick.
    const theirCandidate = readAs(client, other).G.selection!.candidates[0];
    pick(client, other, theirCandidate);
    expect(readAs(client, other).G.selection!.picked).toBeUndefined();
    expect(readAs(client, other).G.selection!.lockedIn).toEqual([]);

    // And a general that was never dealt to you is not a legal pick either.
    pick(client, lord, 'not_a_general');
    expect(readAs(client, lord).G.selection!.lockedIn).toEqual([]);
  });

  it('deals the table and starts turn 1 with the Lord once the last player picks', () => {
    const client = selectingClient(5);
    const lord = lordOf(client); // read it *before* the window closes
    const picks = everyonePicks(client);

    const { G, ctx } = readAs(client, lord);

    expect(G.selection).toBeNull(); // the window is closed
    expect(G.seats[G.activeSeat]).toBe(lord); // plan §2: the Lord starts
    expect(ctx.currentPlayer).toBe(lord);

    // Everyone got the general they chose, and the Lord's +1 max HP.
    expect(G.players[lord].generalId).toBe(picks[lord]);
    expect(G.players[lord].hp).toBe(G.players[lord].maxHp);

    // Hands are dealt (the Lord has drawn 2 more in their draw phase), and the
    // game is now waiting on the Lord's action phase like any other turn.
    expect(G.players[lord].hand).toHaveLength(6);
    for (const id of G.seats.filter((s) => s !== lord)) {
      expect(G.players[id].handCount).toBe(4);
    }
    expect(G.pending).toMatchObject({ kind: 'act', playerId: lord });
    expect(ctx.activePlayers).toEqual({ [lord]: 'act' });
    expect(G.drawPileCount).toBe(107 - 4 * 5 - 2);
  });
});
