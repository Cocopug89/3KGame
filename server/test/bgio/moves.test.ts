// Unit-level tests for the individual move functions on ThreeKingdomsGame
// (task 2.4; rewritten in 4.1b) — playCard, supplyCards, and pass's
// interaction with them. respondDodge/respondPeach were DELETED in 4.1b: 杀→闪
// and 濒死→桃 both ask through the generic card-demand protocol now
// (docs/skill-trigger-design.md §5), so both stages are `demandCard`.
// Unlike game.test.ts (which drives the real boardgame.io framework end to
// end and can't control deck order), these call the move functions directly
// with a hand-built context object, the same way pump.test.ts calls
// resolve() directly — this lets every scenario (in range / out of range,
// dodge / no dodge, strike limit) be set up deterministically.

import { describe, it, expect, vi } from 'vitest';
import { ThreeKingdomsGame } from '../../src/bgio/game.js';
import { pump } from '../../src/engine/pump.js';
import { identityRng, makeGState, makePlayer } from '../engine/fixtures.js';
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

// The Game<G> generic types moves against boardgame.io's full FnContext,
// which is far more than these tests need to stub — cast down to the
// minimal shape actually used, mirroring game.test.ts's BgClient cast.
const actMoves = ThreeKingdomsGame.turn!.stages!.act.moves as unknown as Record<string, MoveFn>;
const demandMoves = ThreeKingdomsGame.turn!.stages!.demandCard.moves as unknown as Record<
  string,
  MoveFn
>;

const identityRandom = { Shuffle: <T,>(deck: T[]) => deck };

function makeEvents() {
  return { setActivePlayers: vi.fn(), endTurn: vi.fn() };
}

/** Two adjacent seats (distance 1), no weapons — default attack range 1
 * covers exactly this, so '1' is always a legal strike target of '0'.
 *
 * generalId is overridden away from makePlayer's cao_cao default: these
 * tests exercise playCard/supplyCards mechanics generically and must stay
 * decoupled from any particular general's skills (4.4: cao_cao's own 奸雄
 * went live and started asking confirmSkill after these strikes land,
 * which these tests predate). 'test_none' matches no id in generals.json,
 * so skillSource.ts's `skillsOfPlayer` returns [] for it — no triggers,
 * ever, no matter what lands later. */
function twoPlayerActState(overrides: Partial<GState> = {}): GState {
  return makeGState({
    players: {
      '0': makePlayer('0', { generalId: 'test_none' }),
      '1': makePlayer('1', { generalId: 'test_none' }),
    },
    seats: ['0', '1'],
    pending: { kind: 'act', playerId: '0' },
    ...overrides,
  });
}

describe('playCard', () => {
  it('rejects when nothing is pending, or a different kind/player is pending', () => {
    const G = twoPlayerActState({ pending: null });
    G.players['0'].hand = ['strike_2c'];
    const events = makeEvents();
    const result = actMoves.playCard(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '0' },
      'strike_2c',
      ['1'],
    );
    expect(result).toBe('INVALID_MOVE');
  });

  it('rejects a card the player does not hold', () => {
    const G = twoPlayerActState();
    const events = makeEvents();
    const result = actMoves.playCard(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '0' },
      'strike_2c',
      ['1'],
    );
    expect(result).toBe('INVALID_MOVE');
  });

  it('rejects a target out of range', () => {
    // 4-seat circle: 0 -> 2 is the opposite seat, distance 2, default
    // (unweaponed) attack range 1 — out of range.
    const G = makeGState({
      players: {
        '0': makePlayer('0', { hand: ['strike_2c'] }),
        '1': makePlayer('1'),
        '2': makePlayer('2'),
        '3': makePlayer('3'),
      },
      seats: ['0', '1', '2', '3'],
      pending: { kind: 'act', playerId: '0' },
    });
    const events = makeEvents();
    const result = actMoves.playCard(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '0' },
      'strike_2c',
      ['2'],
    );
    expect(result).toBe('INVALID_MOVE');
  });

  it('rejects targeting self on a self-forbidden card (strike)', () => {
    const G = twoPlayerActState();
    G.players['0'].hand = ['strike_2c'];
    const events = makeEvents();
    const result = actMoves.playCard(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '0' },
      'strike_2c',
      ['0'],
    );
    expect(result).toBe('INVALID_MOVE');
  });

  it('rejects when canPlay is false (strike limit already reached)', () => {
    const G = twoPlayerActState({ turnFlags: { strikesPlayed: 1, strikeLimit: 1 } });
    G.players['0'].hand = ['strike_2c'];
    const events = makeEvents();
    const result = actMoves.playCard(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '0' },
      'strike_2c',
      ['1'],
    );
    expect(result).toBe('INVALID_MOVE');
  });

  it('playing 杀 discards it, counts it against the strike limit, and blocks on the target for a dodge', () => {
    const G = twoPlayerActState();
    G.players['0'].hand = ['strike_2c'];
    G.players['1'].hand = ['dodge_2h1']; // …and CAN answer: see the next test
    const events = makeEvents();

    const result = actMoves.playCard(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '0' },
      'strike_2c',
      ['1'],
    );

    expect(result).toBeUndefined(); // not INVALID_MOVE
    expect(G.players['0'].hand).toEqual([]);
    expect(G.discardPile).toEqual(['strike_2c']);
    expect(G.turnFlags.strikesPlayed).toBe(1);
    // 4.1b: the 闪 is a DEMAND, not a bespoke respondDodge request.
    expect(G.pending).toEqual({
      kind: 'demandCard',
      playerId: '1',
      demandKind: 'dodge',
      count: 1,
      reasonKey: 'demand.dodge',
      subject: '0',
    });
    expect(G.demand).toEqual({
      kind: 'dodge',
      from: '1',
      by: '0',
      count: 1,
      reasonKey: 'demand.dodge',
      subject: '0',
      supplied: null,
    });
    // The 'act' request re-queued at the bottom — nothing else would re-open
    // the action phase for player 0 once this resolves — then strike's resume
    // frame, then the demandClose that will hand it the answer.
    expect(G.stack).toEqual([
      { t: 'request', req: { kind: 'act', playerId: '0' } },
      {
        t: 'resume',
        effectKey: 'strike',
        ctx: { source: '0', cards: ['strike_2c'], targets: ['1'], demanded: true },
      },
      { t: 'demandClose' },
    ]);
    expect(events.setActivePlayers).toHaveBeenCalledWith({ value: { '1': 'demandCard' } });
    expect(events.endTurn).not.toHaveBeenCalled();
  });

  it('a 杀 at a target who cannot produce a 闪 never asks — the damage just lands', () => {
    // 4.1b: {t:'demandAsk'} folds queries.cardsAs over the target's hand and
    // asks only if they CAN answer. The server knows every hand, so an
    // un-answerable prompt is a wasted round-trip, not fairness — and this is
    // where 八卦阵/护驾 will change the answer, because the demand.open fan-out
    // runs BEFORE this check (§12.2, the wart 3.2 handed back).
    const G = twoPlayerActState();
    G.players['0'].hand = ['strike_2c'];
    G.players['1'].hand = []; // nothing that can be used as a 闪
    const events = makeEvents();

    actMoves.playCard(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '0' },
      'strike_2c',
      ['1'],
    );

    expect(G.players['1'].hp).toBe(3);
    expect(G.demand).toBeNull();
    expect(G.pending).toMatchObject({ kind: 'act', playerId: '0' }); // straight back to the striker
  });

  it('playing 桃 on self heals and immediately re-opens the act request (no response needed)', () => {
    const G = twoPlayerActState();
    G.players['0'].hp = 2;
    G.players['0'].maxHp = 4;
    G.players['0'].hand = ['peach_3h'];
    const events = makeEvents();

    const result = actMoves.playCard(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '0' },
      'peach_3h',
      [],
    );

    expect(result).toBeUndefined();
    expect(G.players['0'].hp).toBe(3);
    expect(G.discardPile).toEqual(['peach_3h']);
    expect(G.pending).toMatchObject({ kind: 'act', playerId: '0' }); // free to act again
    expect(events.setActivePlayers).toHaveBeenCalledWith({ value: { '0': 'act' } });
  });
});

describe('supplyCards — 杀 → 闪 (was the respondDodge stage, deleted in 4.1b)', () => {
  function strikeInFlightState(): GState {
    const G = twoPlayerActState();
    G.players['0'].hand = ['strike_2c'];
    G.players['1'].hand = ['dodge_2h1'];
    const events = makeEvents();
    actMoves.playCard(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '0' },
      'strike_2c',
      ['1'],
    );
    return G;
  }

  it('rejects when demandCard is not the pending kind/player', () => {
    const G = twoPlayerActState();
    const events = makeEvents();
    const result = demandMoves.supplyCards(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '1' },
      undefined,
    );
    expect(result).toBe('INVALID_MOVE');
  });

  it('rejects a dodge card id the responder does not hold', () => {
    const G = strikeInFlightState();
    const events = makeEvents();
    const result = demandMoves.supplyCards(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '1' },
      ['dodge_2h2'], // not in hand
    );
    expect(result).toBe('INVALID_MOVE');
  });

  it('rejects a held card the cardsAs fold does not accept as a 闪', () => {
    const G = strikeInFlightState();
    G.players['1'].hand.push('peach_3h');
    const events = makeEvents();
    const result = demandMoves.supplyCards(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '1' },
      ['peach_3h'],
    );
    expect(result).toBe('INVALID_MOVE');
  });

  it('rejects a partial answer — supply exactly `count` cards or supply none (§5.4)', () => {
    const G = strikeInFlightState();
    G.players['1'].hand.push('dodge_2h2');
    const events = makeEvents();
    const result = demandMoves.supplyCards(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '1' },
      ['dodge_2h1', 'dodge_2h2'], // two, for a demand of one
    );
    expect(result).toBe('INVALID_MOVE');
  });

  it('supplying a real dodge card avoids damage and returns control to the striker', () => {
    const G = strikeInFlightState();
    const events = makeEvents();

    const result = demandMoves.supplyCards(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '1' },
      ['dodge_2h1'],
    );

    expect(result).toBeUndefined();
    expect(G.players['1'].hand).toEqual([]);
    expect(G.discardPile).toEqual(['strike_2c', 'dodge_2h1']);
    expect(G.players['1'].hp).toBe(4); // undamaged
    expect(G.demand).toBeNull(); // demandClose cleared it on the way back
    expect(G.pending).toMatchObject({ kind: 'act', playerId: '0' }); // striker acts again
    expect(G.stack).toEqual([]);
    expect(events.setActivePlayers).toHaveBeenCalledWith({ value: { '0': 'act' } });
  });

  it('declining (no cards) lets the strike deal damage, then returns control to the striker', () => {
    const G = strikeInFlightState();
    const events = makeEvents();

    const result = demandMoves.supplyCards(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '1' },
      undefined,
    );

    expect(result).toBeUndefined();
    expect(G.players['1'].hand).toEqual(['dodge_2h1']); // untouched — declined, not spent
    expect(G.players['1'].hp).toBe(3); // took 1 damage
    expect(G.damage).toBeNull(); // the window closed behind itself
    expect(G.pending).toMatchObject({ kind: 'act', playerId: '0' });
  });

  it('the re-opened act request is real — a subsequent pass rotates the whole turn (no soft-lock)', () => {
    const G = strikeInFlightState();
    demandMoves.supplyCards(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events: makeEvents(), playerID: '1' },
      undefined,
    );
    expect(G.pending).toMatchObject({ kind: 'act', playerId: '0' });

    const events = makeEvents();
    const result = actMoves.pass({
      G,
      ctx: { currentPlayer: '0' },
      random: identityRandom,
      events,
      playerID: '0',
    });
    expect(result).toBeUndefined();
    // Full cycle (discard -> end -> prep -> judge -> draw -> action) ran to
    // completion and landed on the *next* player's action phase — proof
    // the phase machinery wasn't left dangling after playCard/supplyCards.
    expect(G.activeSeat).toBe(1);
    expect(G.pending).toMatchObject({ kind: 'act', playerId: '1' });
    expect(events.setActivePlayers).toHaveBeenCalledWith({ value: { '1': 'act' } });
    expect(events.endTurn).toHaveBeenCalledWith({ next: '1' });
  });
});

describe('supplyCards — 濒死 → 桃 (was the respondPeach stage, deleted in 4.1b)', () => {
  /** Player '0' is in a real dying window: hp 0, a {t:'dying'} frame pumped
   * through the engine, so the demand and its request are built by the code
   * under test rather than hand-faked. The 桃 is asked for through
   * {t:'demand', kind:'peach'} — which is the only reason 华佗's 急救 (any red
   * card, for someone else) can ever exist. */
  function dyingState(hands: Record<PlayerId, string[]> = { '0': ['peach_3h'], '1': [] }): GState {
    const G = twoPlayerActState({ pending: null });
    G.players['0'].hp = 0;
    G.players['0'].hand = [...hands['0']];
    G.players['1'].hand = [...hands['1']];
    G.stack = [{ t: 'dying', target: '0', asker: '0', offset: 0, killer: null }];
    pump(G, identityRng);
    return G;
  }

  it('opens as a peach demand on the dying player themselves (offset 0)', () => {
    const G = dyingState();
    expect(G.pending).toEqual({
      kind: 'demandCard',
      playerId: '0',
      demandKind: 'peach',
      count: 1,
      reasonKey: 'demand.peach',
      subject: '0', // who the 桃 is FOR — a proxy asker needs to be told
    });
  });

  it('rejects a peach card id the responder does not hold', () => {
    const G = dyingState();
    const events = makeEvents();
    const result = demandMoves.supplyCards(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '0' },
      ['peach_4h'], // not in hand
    );
    expect(result).toBe('INVALID_MOVE');
  });

  it('rejects a held card the cardsAs fold does not accept as a 桃', () => {
    const G = dyingState();
    G.players['0'].hand.push('strike_2c');
    const events = makeEvents();
    const result = demandMoves.supplyCards(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '0' },
      ['strike_2c'],
    );
    expect(result).toBe('INVALID_MOVE');
  });

  it('supplying a peach heals, and the re-checked dying frame drops itself once hp > 0', () => {
    const G = dyingState();
    const events = makeEvents();

    const result = demandMoves.supplyCards(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events, playerID: '0' },
      ['peach_3h'],
    );

    expect(result).toBeUndefined();
    expect(G.players['0'].hp).toBe(1);
    expect(G.players['0'].hand).toEqual([]);
    expect(G.discardPile).toEqual(['peach_3h']);
    expect(G.demand).toBeNull();
    expect(G.players['0'].alive).toBe(true); // saved, not dead
    expect(G.pending).toBeNull(); // window closed — nothing left pending
    expect(G.stack).toEqual([]); // re-checked dying frame found hp > 0 and dropped
  });

  it('declining passes the offer to the next living player in seat order', () => {
    // The dying player holds a 桃 (so they are asked first and can decline);
    // the next living seat holds one too.
    const G = dyingState({ '0': ['peach_3h'], '1': ['peach_4h'] });

    const result = demandMoves.supplyCards(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events: makeEvents(), playerID: '0' },
      undefined,
    );

    expect(result).toBeUndefined();
    expect(G.pending).toEqual({
      kind: 'demandCard',
      playerId: '1', // offset 1 — the next living seat
      demandKind: 'peach',
      count: 1,
      reasonKey: 'demand.peach',
      subject: '0',
    });
    expect(G.players['0'].alive).toBe(true); // window still open, not dead yet
  });

  it('an asker who cannot produce a 桃 is never asked — the window walks past them', () => {
    // '1' holds nothing: {t:'demandAsk'} folds cardsAs over their hand, finds
    // no candidate, and doesn't spend a round-trip on a question they can't
    // answer. Same call 3.1 §2.1 makes for nullification askers.
    const G = dyingState({ '0': ['peach_3h'], '1': [] });

    demandMoves.supplyCards(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events: makeEvents(), playerID: '0' },
      undefined,
    );

    // Straight past '1' to death — no demandCard request for them at all.
    expect(G.players['0'].alive).toBe(false);
  });

  it('nobody able to save results in death, once every living player has been asked', () => {
    const G = dyingState({ '0': ['peach_3h'], '1': [] });

    const result = demandMoves.supplyCards(
      { G, ctx: { currentPlayer: '0' }, random: identityRandom, events: makeEvents(), playerID: '0' },
      undefined,
    );

    expect(result).toBeUndefined();
    expect(G.players['0'].alive).toBe(false);
    expect(G.players['0'].roleRevealed).toBe(true);

    // F1 (docs/phase-2-review.md), fixed in 3.2: '0' was the TURN player, so
    // their death ends their turn and play moves on to the next living seat.
    // Before the fix this left G.pending naming the corpse with an empty stack
    // — a permanent wedge, and the whole reason 决斗/闪电 couldn't ship.
    expect(G.pending).toMatchObject({ playerId: '1' });
    expect(G.players['1'].alive).toBe(true);
  });
});
