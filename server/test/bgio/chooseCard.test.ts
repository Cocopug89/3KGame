// Task 3.3 end-to-end, through the real moves and the real pump: play the
// card → the 无懈可击 window opens and closes → the chooseCard request appears
// → answer it with a SLOT → the card actually moves.
//
// Same harness as moves.test.ts (call the move functions directly with a
// hand-built context) so the deck and every hand are deterministic.

import { describe, it, expect, vi } from 'vitest';
import { ThreeKingdomsGame } from '../../src/bgio/game.js';
import { makeGState, makePlayer } from '../engine/fixtures.js';
import type { GState, PlayerId } from '../../src/engine/state.js';

interface MoveCtx {
  G: GState;
  ctx: { currentPlayer: PlayerId };
  random: { Shuffle<T>(deck: T[]): T[] };
  events: {
    setActivePlayers: (arg: { value: Record<PlayerId, string> }) => void;
    endTurn: (arg?: { next: PlayerId }) => void;
  };
  playerID: PlayerId;
}
type MoveFn = (ctx: MoveCtx, ...args: unknown[]) => unknown;

const actMoves = ThreeKingdomsGame.turn!.stages!.act.moves as unknown as Record<string, MoveFn>;
const chooseCardMoves = ThreeKingdomsGame.turn!.stages!.chooseCard.moves as unknown as Record<
  string,
  MoveFn
>;
const demandCardMoves = ThreeKingdomsGame.turn!.stages!.demandCard.moves as unknown as Record<
  string,
  MoveFn
>;

const identityRandom = { Shuffle: <T,>(deck: T[]) => deck };
const makeEvents = () => ({ setActivePlayers: vi.fn(), endTurn: vi.fn() });
const move = (G: GState, playerID: PlayerId) => ({
  G,
  ctx: { currentPlayer: '0' as PlayerId },
  random: identityRandom,
  events: makeEvents(),
  playerID,
});

/** '0' plays; '1' sits next door (distance 1, so 顺手牵羊 reaches) holding two
 * hand cards, a weapon and a delayed trick. Nobody holds a 无懈可击, so the
 * nullification window closes on its own without asking anyone. */
function tableWith(hand0: string[], overrides: Partial<GState> = {}): GState {
  return makeGState({
    players: {
      '0': makePlayer('0', { hand: hand0 }),
      '1': makePlayer('1', {
        hand: ['strike_2c', 'peach_3h'],
        equipment: { weapon: 'zhuge_crossbow_ac', armour: null, plusHorse: null, minusHorse: null },
        judgementZone: ['indulgence_6h'],
      }),
    },
    seats: ['0', '1'],
    pending: { kind: 'act', playerId: '0' },
    drawPile: ['dodge_2h1', 'dodge_2h2', 'dodge_3d'],
    ...overrides,
  });
}

describe('过河拆桥 end to end', () => {
  it('play → chooseCard request (slots, no hand ids) → the card is discarded', () => {
    const G = tableWith(['dismantle_3c']);

    actMoves.playCard(move(G, '0'), 'dismantle_3c', ['1']);

    // The nullify window asked nobody (no 无懈可击 in play) and the effect ran
    // straight through to its request.
    expect(G.pending).toEqual({
      kind: 'chooseCard',
      playerId: '0',
      target: '1',
      reasonKey: 'choose.dismantle',
      choices: [
        { z: 'hand', index: 0 },
        { z: 'hand', index: 1 },
        { z: 'equip', cardId: 'zhuge_crossbow_ac' },
        { z: 'judgementZone', cardId: 'indulgence_6h' },
      ],
    });
    expect(JSON.stringify(G.pending)).not.toContain('peach_3h');

    // Point at hand slot 1 — the server maps it to peach_3h.
    const result = chooseCardMoves.chooseCard(move(G, '0'), { z: 'hand', index: 1 });
    expect(result).toBeUndefined();

    expect(G.players['1'].hand).toEqual(['strike_2c']);
    expect(G.discardPile).toContain('peach_3h');
    expect(G.discardPile).toContain('dismantle_3c'); // the trick itself
    expect(G.pending).toEqual({ kind: 'act', playerId: '0' }); // action phase resumes
  });

  it('can rip a delayed trick out of the judgement zone', () => {
    const G = tableWith(['dismantle_3c']);
    actMoves.playCard(move(G, '0'), 'dismantle_3c', ['1']);
    chooseCardMoves.chooseCard(move(G, '0'), { z: 'judgementZone', cardId: 'indulgence_6h' });

    expect(G.players['1'].judgementZone).toEqual([]);
    expect(G.discardPile).toContain('indulgence_6h');
  });

  it('can strip equipment', () => {
    const G = tableWith(['dismantle_3c']);
    actMoves.playCard(move(G, '0'), 'dismantle_3c', ['1']);
    chooseCardMoves.chooseCard(move(G, '0'), { z: 'equip', cardId: 'zhuge_crossbow_ac' });

    expect(G.players['1'].equipment.weapon).toBeNull();
    expect(G.discardPile).toContain('zhuge_crossbow_ac');
  });

  it('cannot target a player with no cards at all', () => {
    const G = tableWith(['dismantle_3c']);
    G.players['1'].hand = [];
    G.players['1'].equipment = { weapon: null, armour: null, plusHorse: null, minusHorse: null };
    G.players['1'].judgementZone = [];

    expect(actMoves.playCard(move(G, '0'), 'dismantle_3c', ['1'])).toBe('INVALID_MOVE');
    expect(G.players['0'].hand).toEqual(['dismantle_3c']); // an illegal move applies nothing
  });
});

describe('顺手牵羊 end to end', () => {
  it('takes the chosen card into the thief’s hand', () => {
    const G = tableWith(['steal_3s']);
    actMoves.playCard(move(G, '0'), 'steal_3s', ['1']);
    expect(G.pending!.kind).toBe('chooseCard');

    chooseCardMoves.chooseCard(move(G, '0'), { z: 'hand', index: 0 });

    expect(G.players['0'].hand).toEqual(['strike_2c']);
    expect(G.players['1'].hand).toEqual(['peach_3h']);
    expect(G.discardPile).not.toContain('strike_2c');
  });

  it('is out of reach at distance 2 (4-seat circle, opposite seat)', () => {
    const G = makeGState({
      players: {
        '0': makePlayer('0', { hand: ['steal_3s'] }),
        '1': makePlayer('1'),
        '2': makePlayer('2', { hand: ['peach_3h'] }),
        '3': makePlayer('3'),
      },
      seats: ['0', '1', '2', '3'],
      pending: { kind: 'act', playerId: '0' },
    });
    expect(actMoves.playCard(move(G, '0'), 'steal_3s', ['2'])).toBe('INVALID_MOVE');
  });
});

describe('无中生有 end to end', () => {
  it('draws two', () => {
    const G = tableWith(['draw_two_7h']);
    actMoves.playCard(move(G, '0'), 'draw_two_7h', []);

    expect(G.players['0'].hand).toEqual(['dodge_2h1', 'dodge_2h2']);
    expect(G.drawPile).toEqual(['dodge_3d']);
    expect(G.pending).toEqual({ kind: 'act', playerId: '0' });
  });
});

// The point of these three cards being `nullify: 'once'` (the trick default,
// set nowhere in their source) is that this works without them knowing.
describe('the 无懈可击 window wraps all three for free', () => {
  it('a nullified 过河拆桥 never even asks which card', () => {
    const G = tableWith(['dismantle_3c']);
    G.players['1'].hand.push('nullification_js');

    actMoves.playCard(move(G, '0'), 'dismantle_3c', ['1']);

    // The victim is asked for a 无懈可击 BEFORE the attacker is asked to choose.
    expect(G.pending).toMatchObject({
      kind: 'demandCard',
      playerId: '1',
      demandKind: 'nullification',
      reasonKey: 'nullify.dismantle',
    });

    demandCardMoves.supplyCards(move(G, '1'), ['nullification_js']);

    // Chain is odd ⇒ the effect is cancelled: no chooseCard request was ever
    // raised, and '1' still holds everything but the 无懈可击 they spent.
    expect(G.pending).toEqual({ kind: 'act', playerId: '0' });
    expect(G.players['1'].hand).toEqual(['strike_2c', 'peach_3h']);
    expect(G.players['1'].equipment.weapon).toBe('zhuge_crossbow_ac');
    expect(G.discardPile).toContain('nullification_js');
  });

  it('a nullified 无中生有 draws nothing', () => {
    const G = tableWith(['draw_two_7h']);
    G.players['1'].hand.push('nullification_js');

    actMoves.playCard(move(G, '0'), 'draw_two_7h', []);
    expect(G.pending!.kind).toBe('demandCard');
    demandCardMoves.supplyCards(move(G, '1'), ['nullification_js']);

    expect(G.players['0'].hand).toEqual([]);
    expect(G.drawPile).toEqual(['dodge_2h1', 'dodge_2h2', 'dodge_3d']);
  });
});

describe('the chooseCard move rejects what it should', () => {
  const armed = () => {
    const G = tableWith(['dismantle_3c']);
    actMoves.playCard(move(G, '0'), 'dismantle_3c', ['1']);
    return G;
  };

  it('rejects an answer from anyone but the player who was asked', () => {
    const G = armed();
    expect(chooseCardMoves.chooseCard(move(G, '1'), { z: 'hand', index: 0 })).toBe('INVALID_MOVE');
    expect(G.pending!.kind).toBe('chooseCard'); // still waiting
  });

  it('rejects an out-of-bounds hand index', () => {
    const G = armed();
    expect(chooseCardMoves.chooseCard(move(G, '0'), { z: 'hand', index: 7 })).toBe('INVALID_MOVE');
    expect(chooseCardMoves.chooseCard(move(G, '0'), { z: 'hand', index: -1 })).toBe('INVALID_MOVE');
    expect(G.players['1'].hand).toHaveLength(2);
  });

  it('rejects equipment the target is not wearing', () => {
    const G = armed();
    expect(chooseCardMoves.chooseCard(move(G, '0'), { z: 'equip', cardId: 'frost_blade_2s' })).toBe(
      'INVALID_MOVE',
    );
  });

  it('rejects a card id smuggled in where a hand slot belongs', () => {
    const G = armed();
    // The attacker knows peach_3h is in there (they can see the discard pile,
    // count cards, whatever) — the wire format still gives them no way to say
    // so. A hand slot is an index, full stop.
    expect(
      chooseCardMoves.chooseCard(move(G, '0'), { z: 'hand', cardId: 'peach_3h' } as never),
    ).toBe('INVALID_MOVE');
    expect(G.players['1'].hand).toContain('peach_3h');
  });

  it('rejects an answer when nothing is pending', () => {
    const G = tableWith(['dismantle_3c']);
    G.pending = null;
    expect(chooseCardMoves.chooseCard(move(G, '0'), { z: 'hand', index: 0 })).toBe('INVALID_MOVE');
  });
});
