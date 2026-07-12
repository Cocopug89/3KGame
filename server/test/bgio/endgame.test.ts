// Task 5.3, end to end through the real boardgame.io reducer: a 杀 kills a
// player, the dying window closes with nobody holding a 桃, and then the three
// things 5.3 added actually land in a *client's* view of the match —
//
//   1. the hidden role is face up (playerView sends `role` only once
//      roleRevealed is set, so this is the whole reveal mechanism),
//   2. the killer collects the Rebel bounty (or, for the Lord, pays for a
//      Loyalist),
//   3. a game that has been won is CLOSED: `endIf` fires, and a move sent into
//      it afterwards does nothing.
//
// Unit tests can't catch (3) — whether `endIf` is wired at all is a fact about
// the framework, not about the engine. Same rigged-deal approach as
// bgio/game.test.ts (real setup(), then cards *moved* between zones), with its
// own copy of the rig so importing one test file from another can't double-run
// a suite.

import { Client } from 'boardgame.io/dist/cjs/client.js';
import { describe, it, expect } from 'vitest';
import { cards, generals } from '@3k/shared';
import { ThreeKingdomsGame } from '../../src/bgio/game.js';
import { makeRng, type BgioRandomLike } from '../../src/bgio/rng.js';
import { initGame } from '../../src/engine/setup.js';
import { pump } from '../../src/engine/pump.js';
import type { CardId, GState, PlayerId, Role } from '../../src/engine/state.js';

interface ViewPlayer {
  hand?: CardId[];
  handCount?: number;
  hp: number;
  alive: boolean;
  role?: string;
  roleRevealed: boolean;
  equipment: Record<string, string | null>;
}

interface ViewState {
  players: Record<PlayerId, ViewPlayer>;
  discardPile: CardId[];
  pending: { playerId?: PlayerId; waitingOn?: PlayerId; kind: string } | null;
  log: { key: string; params?: Record<string, unknown> }[];
  gameOver?: { winners: PlayerId[]; condition: Role };
}

interface BgClient {
  start(): void;
  updatePlayerID(id: PlayerId): void;
  moves: Record<string, (...args: unknown[]) => void>;
  getState(): { G: ViewState; ctx: { gameover?: unknown } } | null;
}

const STRIKES = cards.filter((c) => c.effectKey === 'strike').map((c) => c.id);
const CROSSBOW = cards.find((c) => c.effectKey === 'zhuge_crossbow')!.id;

interface Rig {
  roles: Record<PlayerId, Role>;
  hands: Record<PlayerId, CardId[]>;
  equip?: Record<PlayerId, CardId>;
  hp?: Record<PlayerId, number>;
}

function riggedClient(rig: Rig, numPlayers = 4): BgClient {
  const game = {
    ...ThreeKingdomsGame,
    setup: ({ ctx, random }: { ctx: { numPlayers: number }; random: unknown }) => {
      const playerIds: PlayerId[] = Array.from({ length: ctx.numPlayers }, (_, i) => String(i));
      const rng = makeRng(random as BgioRandomLike);
      const generalIds = Object.fromEntries(playerIds.map((id, i) => [id, generals[i].id]));
      const G: GState = initGame({ playerIds, generalIds, roles: rig.roles }, rng);
      pump(G, rng);

      // Every hand back to the pile, then deal the exact ones this test needs —
      // cards are moved, never invented, so the 107-card count still holds.
      for (const p of Object.values(G.players)) {
        G.drawPile.push(...p.hand);
        p.hand = [];
      }
      const take = (cardId: CardId): CardId => {
        const i = G.drawPile.indexOf(cardId);
        if (i === -1) throw new Error(`rig: '${cardId}' is not in the draw pile`);
        G.drawPile.splice(i, 1);
        return cardId;
      };
      for (const [id, hand] of Object.entries(rig.hands)) {
        G.players[id].hand = hand.map(take);
      }
      for (const [id, cardId] of Object.entries(rig.equip ?? {})) {
        G.players[id].equipment.weapon = take(cardId);
      }
      for (const [id, hp] of Object.entries(rig.hp ?? {})) {
        G.players[id].hp = hp;
      }
      return G;
    },
  };
  const client = Client({ game, numPlayers }) as unknown as BgClient;
  client.start();
  return client;
}

/** Reads the match as a player who is NOT the one we're asserting about, so the
 * role we see is one playerView chose to send — not one we were entitled to
 * because it's our own seat. */
function viewAs(client: BgClient, playerID: PlayerId): ViewState {
  client.updatePlayerID(playerID);
  const state = client.getState();
  if (!state) throw new Error('viewAs: no state');
  return state.G;
}

// The Lord ('0') always starts (plan §2), and seat 1 is the one seat inside a
// base attack range of 1 — so '1' is the victim in every scenario below, and
// which role they hold is what changes.
const LETHAL = { hands: { '0': [STRIKES[0]] }, hp: { '1': 1 } };

describe('a death, over the real framework', () => {
  it('turns the dead player’s hidden role face up for everyone', () => {
    const client = riggedClient({
      roles: { '0': 'lord', '1': 'rebel', '2': 'loyalist', '3': 'traitor' },
      ...LETHAL,
    });

    // Before: '1' is just a face. Read as '2', who is entitled to know nothing.
    const before = viewAs(client, '2');
    expect(before.players['1'].roleRevealed).toBe(false);
    expect(before.players['1'].role).toBeUndefined();

    client.updatePlayerID('0');
    client.moves.playCard(STRIKES[0], ['1']);

    const after = viewAs(client, '2');
    expect(after.players['1'].alive).toBe(false);
    expect(after.players['1'].roleRevealed).toBe(true);
    expect(after.players['1'].role).toBe('rebel');
    expect(after.log.map((e) => e.key)).toContain('log.death');
  });

  it('pays the Rebel bounty — the killer draws three, and the game plays on', () => {
    const client = riggedClient({
      roles: { '0': 'lord', '1': 'rebel', '2': 'loyalist', '3': 'traitor' },
      ...LETHAL,
    });
    client.updatePlayerID('0');
    client.moves.playCard(STRIKES[0], ['1']);

    const G = viewAs(client, '0');
    expect(G.players['0'].hand).toHaveLength(3); // played their only card, drew 3
    expect(G.gameOver).toBeUndefined(); // the Traitor is still out there
    expect(G.pending).toMatchObject({ kind: 'act', playerId: '0' }); // still their turn
  });

  it('strips the Lord of hand AND equipment for killing a Loyalist', () => {
    const client = riggedClient({
      roles: { '0': 'lord', '1': 'loyalist', '2': 'rebel', '3': 'traitor' },
      hands: { '0': [STRIKES[0], STRIKES[1], STRIKES[2]] },
      equip: { '0': CROSSBOW },
      hp: { '1': 1 },
    });
    client.updatePlayerID('0');
    client.moves.playCard(STRIKES[0], ['1']);

    // '1' is sima_yi (generals[1] under the fixed-general-order rig) and '0'
    // still holds choosable cards/equipment at the moment the damage lands —
    // exactly the condition under which 反馈 (fankui, task 4.3) legitimately
    // offers '1' a card from the source before the dying window (and this
    // kill's own penalty) can proceed. Decline it, the same "no" every other
    // scripted playthrough gives, so the death this test is actually about
    // gets to resolve.
    client.updatePlayerID('1');
    if (viewAs(client, '1').pending?.kind === 'confirmSkill') {
      client.moves.respondSkill(false);
    }

    const G = viewAs(client, '0');
    expect(G.players['0'].hand).toEqual([]);
    expect(G.players['0'].equipment.weapon).toBeNull();
    expect(G.discardPile).toEqual(expect.arrayContaining([STRIKES[1], STRIKES[2], CROSSBOW]));
    expect(G.gameOver).toBeUndefined();
    expect(G.log.map((e) => e.key)).toContain('log.kill_penalty');
  });
});

describe('winning the match', () => {
  // No Traitor at this table: the last Rebel dying wins it outright for the
  // Lord's side. (initGame takes the role deal as given — the count table is
  // roleCountsForPlayerCount's business, and this is a rigged deal.)
  const wonByLord = () =>
    riggedClient({
      roles: { '0': 'lord', '1': 'rebel', '2': 'loyalist', '3': 'loyalist' },
      ...LETHAL,
    });

  it('ends the game, names the winning side, and reveals every role', () => {
    const client = wonByLord();
    client.updatePlayerID('0');
    client.moves.playCard(STRIKES[0], ['1']);

    const G = viewAs(client, '2');
    expect(G.gameOver).toEqual({ winners: ['0', '2', '3'], condition: 'lord' });
    for (const id of ['0', '1', '2', '3']) {
      expect(G.players[id].roleRevealed).toBe(true);
      expect(G.players[id].role).toBeTruthy();
    }
    expect(G.log.map((e) => e.key)).toContain('log.game_over');
  });

  it('closes the match — boardgame.io refuses every move after it', () => {
    const client = wonByLord();
    client.updatePlayerID('0');
    client.moves.playCard(STRIKES[0], ['1']);

    const state = client.getState()!;
    expect(state.ctx.gameover).toEqual({ winners: ['0', '2', '3'], condition: 'lord' });

    const before = JSON.stringify(viewAs(client, '0'));
    client.updatePlayerID('0');
    client.moves.pass();
    client.moves.playCard(STRIKES[1], ['3']);
    expect(JSON.stringify(viewAs(client, '0'))).toEqual(before);
  });

  it('pays no bounty for the kill that ends it', () => {
    const client = wonByLord();
    client.updatePlayerID('0');
    client.moves.playCard(STRIKES[0], ['1']);
    expect(viewAs(client, '0').players['0'].hand).toEqual([]);
  });
});
