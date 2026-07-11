// F1 (docs/phase-2-review.md), fixed in task 3.2: the turn player dying during
// their OWN turn used to wedge the game permanently — `playCard` queues a fresh
// `act` request underneath the play it pushes, so if the play killed its own
// source the request popped after the death and pump() blocked forever on a
// corpse with an empty stack.
//
// Unreachable with only 杀/闪/桃. Reachable on Phase 3's 决斗 (backfires onto the
// source) and 闪电 (kills in the victim's own judge phase), and on Phase 4's 苦肉
// (黄盖 can drop himself to 0 in his own action phase with no Phase 3 card at
// all) — which is why it had to be fixed before any of the three were written.
//
// The fix must end the turn WITHOUT discarding work owed to other players
// (engine-design §5: "an AoE that kills player 3 still hits players 4 and 5"),
// which is what makes it a design decision rather than an `if (dead) return`.

import { describe, it, expect } from 'vitest';
import { pump } from '../../src/engine/pump.js';
import { makeGState, makePlayer, identityRng } from './fixtures.js';
import type { GState } from '../../src/engine/state.js';

function fourPlayers(): GState {
  return makeGState({
    players: {
      '0': makePlayer('0', { hp: 1 }),
      '1': makePlayer('1'),
      '2': makePlayer('2'),
      '3': makePlayer('3'),
    },
    seats: ['0', '1', '2', '3'],
    activeSeat: 0, // '0' is the turn player — and about to die on their own turn
    turnPhase: 'action',
    drawPile: ['strike_2c', 'peach_3h', 'dodge_2h1', 'dodge_2d1', 'strike_3c', 'peach_4h'],
  });
}

describe('F1 — the turn player dies during their own turn', () => {
  it('ends their turn and hands play to the next living seat, instead of wedging on a corpse', () => {
    const G = fourPlayers();
    // Exactly the stack playCard leaves behind — the play, then the re-queued
    // `act` request that lets the player keep acting (2.4's soft-lock fix).
    G.stack.push({ t: 'request', req: { kind: 'act', playerId: '0' } });
    G.stack.push({ t: 'damage', source: '1', target: '0', amount: 1, kind: 'normal' }); // 决斗 backfire

    pump(G, identityRng);

    expect(G.players['0'].alive).toBe(false);
    // BEFORE the fix: G.pending = { kind:'act', playerId:'0' } — a dead player —
    // with an empty stack. Nobody could move; nothing could advance. Forever.
    expect(G.pending).not.toBeNull();
    expect(G.pending!.playerId).not.toBe('0');
    expect(G.players[G.pending!.playerId].alive).toBe(true);
    // The turn moved on to the next LIVING seat, and its phases actually ran.
    expect(G.seats[G.activeSeat]).toBe('1');
    expect(G.players['1'].hand.length).toBeGreaterThan(0); // '1' drew in their draw phase
    expect(G.turnFlags.strikesPlayed).toBe(0); // per-turn state was reset by the end phase
  });

  it('still resolves everything in flight first — an AoE that kills the turn player finishes hitting everyone else', () => {
    // The tension the fix exists to hold: end the turn, but don't cancel the
    // stack. Both, in that order.
    const G = fourPlayers();
    G.players['2'].hp = 3;
    G.players['3'].hp = 3;
    G.stack.push({ t: 'request', req: { kind: 'act', playerId: '0' } });
    G.stack.push(
      { t: 'damage', source: '1', target: '3', amount: 1, kind: 'normal' }, // still owed
      { t: 'damage', source: '1', target: '2', amount: 1, kind: 'normal' }, // still owed
      { t: 'damage', source: '1', target: '0', amount: 1, kind: 'normal' }, // kills the turn player
    );

    pump(G, identityRng);

    expect(G.players['0'].alive).toBe(false);
    expect(G.players['2'].hp).toBe(2); // hit anyway
    expect(G.players['3'].hp).toBe(2); // hit anyway
    expect(G.seats[G.activeSeat]).toBe('1'); // …and only THEN did the turn end
  });

  it("a non-turn player dying doesn't touch the turn at all", () => {
    const G = fourPlayers();
    G.players['0'].hp = 4;
    G.players['2'].hp = 1;
    G.stack.push({ t: 'request', req: { kind: 'act', playerId: '0' } });
    G.stack.push({ t: 'damage', source: '0', target: '2', amount: 1, kind: 'normal' });

    pump(G, identityRng);

    expect(G.players['2'].alive).toBe(false);
    expect(G.seats[G.activeSeat]).toBe('0'); // still '0's turn
    expect(G.pending).toMatchObject({ kind: 'act', playerId: '0' }); // still acting
  });
});
