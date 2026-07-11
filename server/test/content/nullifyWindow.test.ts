// The 无懈可击 chain — docs/judgement-nullification-design.md §2. Task 3.2.
//
// The model is PARITY, not recursion: odd number of 无懈可击 ⇒ the protected
// effect is cancelled, even ⇒ it happens. One window re-opens itself with the
// parity flipped and the circle restarted, rather than nesting a fresh window
// per counter. These tests drive it through the real pump + the real
// supplyCards move, to depth 3 (all three 无懈可击 in the deck, in one argument).

import { describe, it, expect, vi } from 'vitest';
import { pump } from '../../src/engine/pump.js';
import { nullifyWindowFrame } from '../../src/content/effects/nullifyWindow.js';
import { canRespondNullify, nullifyAskerAtOffset } from '../../src/engine/nullify.js';
import { ThreeKingdomsGame } from '../../src/bgio/game.js';
import { makeGState, makePlayer, identityRng } from '../engine/fixtures.js';
import type { GState, PlayerId } from '../../src/engine/state.js';
import type { Frame } from '../../src/engine/frames.js';

const NULLIFICATIONS = ['nullification_js', 'nullification_qc', 'nullification_kc'];

/** The frame the window is guarding — a heal is a convenient observable stand-in
 * for "the trick actually happened" until 3.3/3.4 ship real tricks. */
const PROTECT: Frame = { t: 'heal', target: '0', amount: 1 };
const ON_NULLIFIED: Frame = { t: 'heal', target: '1', amount: 1 };

function table(hands: Record<PlayerId, string[]> = {}): GState {
  const G = makeGState({
    players: {
      '0': makePlayer('0', { hp: 1, maxHp: 4 }),
      '1': makePlayer('1', { hp: 1, maxHp: 4 }),
      '2': makePlayer('2', { hp: 1, maxHp: 4 }),
      '3': makePlayer('3', { hp: 1, maxHp: 4 }),
    },
    seats: ['0', '1', '2', '3'],
    activeSeat: 0,
  });
  for (const [id, hand] of Object.entries(hands)) G.players[id].hand = [...hand];
  return G;
}

const supplyMove = (
  ThreeKingdomsGame.turn!.stages!.demandCard.moves as unknown as Record<
    string,
    (c: unknown, ...a: unknown[]) => unknown
  >
).supplyCards;

/** Answers whatever demandCard request is pending, as that player. */
function answer(G: GState, cardIds: string[] | null) {
  const playerID = G.pending!.playerId;
  return supplyMove(
    {
      G,
      ctx: { currentPlayer: '0' },
      random: { Shuffle: <T,>(d: T[]) => d },
      events: { setActivePlayers: vi.fn(), endTurn: vi.fn() },
      playerID,
    },
    cardIds,
  );
}

describe('nullifyAskerAtOffset / canRespondNullify', () => {
  it('asks only players who can actually answer, clockwise from the TURN player', () => {
    const G = table({ '2': [NULLIFICATIONS[0]], '3': [NULLIFICATIONS[1]] });
    G.activeSeat = 1; // turn player is '1' ⇒ walk 1, 2, 3, 0
    expect(nullifyAskerAtOffset(G, 0)).toBe('2');
    expect(nullifyAskerAtOffset(G, 1)).toBe('3');
    expect(nullifyAskerAtOffset(G, 2)).toBeNull(); // '0' and '1' hold none — never asked
  });

  it('never asks the dead', () => {
    const G = table({ '2': [NULLIFICATIONS[0]] });
    G.players['2'].alive = false;
    expect(canRespondNullify(G, '2')).toBe(false);
    expect(nullifyAskerAtOffset(G, 0)).toBeNull();
  });
});

describe('the nullification window (parity chain)', () => {
  it('nobody can nullify ⇒ no request at all, the effect just happens', () => {
    const G = table(); // no 无懈可击 anywhere
    G.stack.push(nullifyWindowFrame(PROTECT, 'nullify.test', ON_NULLIFIED));
    pump(G, identityRng);

    expect(G.pending).toBeNull(); // not a single wasted round-trip
    expect(G.players['0'].hp).toBe(2); // protect ran
    expect(G.players['1'].hp).toBe(1);
  });

  it('ONE 无懈可击 (odd) cancels the effect — and pushes onNullified instead', () => {
    const G = table({ '2': [NULLIFICATIONS[0]] });
    G.stack.push(nullifyWindowFrame(PROTECT, 'nullify.test', ON_NULLIFIED));
    pump(G, identityRng);

    expect(G.pending).toMatchObject({ kind: 'demandCard', playerId: '2', demandKind: 'nullification' });
    answer(G, [NULLIFICATIONS[0]]);

    expect(G.players['0'].hp).toBe(1); // protect did NOT run
    expect(G.players['1'].hp).toBe(2); // onNullified did — the 闪电-travels rule
    expect(G.discardPile).toContain(NULLIFICATIONS[0]);
    expect(G.pending).toBeNull();
  });

  it('TWO 无懈可击 (even) cancel each other out — the effect happens after all', () => {
    const G = table({ '2': [NULLIFICATIONS[0]], '3': [NULLIFICATIONS[1]] });
    G.stack.push(nullifyWindowFrame(PROTECT, 'nullify.test', ON_NULLIFIED));
    pump(G, identityRng);

    // '2' nullifies…
    expect(G.pending!.playerId).toBe('2');
    answer(G, [NULLIFICATIONS[0]]);
    // …and the circle RESTARTS, so '3' gets the chance to counter that very card.
    expect(G.pending).toMatchObject({ kind: 'demandCard', playerId: '3' });
    answer(G, [NULLIFICATIONS[1]]);

    expect(G.players['0'].hp).toBe(2); // parity even ⇒ protect ran
    expect(G.players['1'].hp).toBe(1); // onNullified did not
  });

  it('THREE 无懈可击 (odd) — the whole deck in one argument — cancels, and terminates', () => {
    // Termination is free: every "yes" permanently removes a 无懈可击 from a
    // hand, and there are only 3 in the deck (§2.3).
    const G = table({
      '1': [NULLIFICATIONS[2]],
      '2': [NULLIFICATIONS[0]],
      '3': [NULLIFICATIONS[1]],
    });
    G.stack.push(nullifyWindowFrame(PROTECT, 'nullify.test', ON_NULLIFIED));
    pump(G, identityRng);

    answer(G, [NULLIFICATIONS[2]]); // '1' (nearest the turn player) — chain depth 1
    answer(G, [NULLIFICATIONS[0]]); // '2' counters — depth 2
    answer(G, [NULLIFICATIONS[1]]); // '3' counters back — depth 3

    expect(G.pending).toBeNull(); // circle exhausted: nobody holds one any more
    expect(G.players['0'].hp).toBe(1); // odd ⇒ cancelled
    expect(G.players['1'].hp).toBe(2); // onNullified ran
    expect(G.discardPile).toHaveLength(3);
  });

  it('declining passes the offer to the next holder, and a declined chain lets the effect through', () => {
    const G = table({ '2': [NULLIFICATIONS[0]], '3': [NULLIFICATIONS[1]] });
    G.stack.push(nullifyWindowFrame(PROTECT, 'nullify.test'));
    pump(G, identityRng);

    expect(G.pending!.playerId).toBe('2');
    answer(G, null); // "no thanks"
    expect(G.pending!.playerId).toBe('3'); // offer moves on
    answer(G, null);

    expect(G.pending).toBeNull();
    expect(G.players['0'].hp).toBe(2); // nobody nullified ⇒ the effect happened
    expect(G.discardPile).toEqual([]); // and nobody spent a card
  });

  it('a window with no onNullified simply drops the effect when the chain lands odd', () => {
    const G = table({ '2': [NULLIFICATIONS[0]] });
    G.stack.push(nullifyWindowFrame(PROTECT, 'nullify.test')); // no onNullified
    pump(G, identityRng);
    answer(G, [NULLIFICATIONS[0]]);

    expect(G.players['0'].hp).toBe(1); // cancelled
    expect(G.stack).toEqual([]); // …and nothing took its place
  });
});

describe('supplyCards (the demandCard move)', () => {
  it('rejects a card the player does not hold, a wrong-kind card, and a wrong-sized answer', () => {
    const G = table({ '2': [NULLIFICATIONS[0], 'strike_2c'] });
    G.stack.push(nullifyWindowFrame(PROTECT, 'nullify.test'));
    pump(G, identityRng);

    expect(answer(G, [NULLIFICATIONS[1]])).toBe('INVALID_MOVE'); // not in hand
    expect(answer(G, ['strike_2c'])).toBe('INVALID_MOVE'); // wrong kind
    expect(answer(G, [NULLIFICATIONS[0], 'strike_2c'])).toBe('INVALID_MOVE'); // count ≠ 1
    expect(G.pending).not.toBeNull(); // still waiting — no state was touched
    expect(G.players['2'].hand).toHaveLength(2);

    expect(answer(G, [NULLIFICATIONS[0]])).toBeUndefined(); // …and the legal answer works
    expect(G.players['2'].hand).toEqual(['strike_2c']);
  });
});
