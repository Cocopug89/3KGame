// Task 5.2 — the general-selection window, as pure engine state.
// The bgio wiring (who is in which stage, what a client is allowed to see) is
// covered in test/bgio/selection.test.ts against the real framework.

import { describe, it, expect } from 'vitest';
import { generals } from '@3k/shared';
import {
  LORD_CANDIDATES,
  PLAYER_CANDIDATES,
  applyPick,
  dealCandidates,
  isSelectionComplete,
} from '../../src/engine/selection.js';
import { completeSelection, initSelection, lordOf } from '../../src/engine/setup.js';
import { identityRng, reverseRng } from './fixtures.js';

const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i));

/** identityRng leaves the role pool in order, so player '0' draws the Lord;
 * reverseRng puts the Lord on the *last* seat, which is what makes the
 * "turn 1 goes to the Lord, not to seat 0" test mean anything. */
function startedGame(numPlayers = 4, rng = identityRng) {
  const G = initSelection({ playerIds: ids(numPlayers) }, rng);
  return { G, rng };
}

describe('dealCandidates', () => {
  it('gives the Lord a wider pool than everyone else', () => {
    const candidates = dealCandidates(ids(4), '0', identityRng);

    expect(candidates['0']).toHaveLength(LORD_CANDIDATES);
    for (const id of ['1', '2', '3']) {
      expect(candidates[id]).toHaveLength(PLAYER_CANDIDATES);
    }
  });

  it('never deals the same general to two players — they are cards on a table', () => {
    for (const n of [4, 5, 6, 7, 8]) {
      const candidates = dealCandidates(ids(n), '0', reverseRng);
      const dealt = Object.values(candidates).flat();
      expect(new Set(dealt).size).toBe(dealt.length);
      expect(dealt.every((id) => generals.some((g) => g.id === id))).toBe(true);
    }
  });

  it('shrinks the Lord’s pool, not everyone else’s, when the deck runs short', () => {
    // 8 players × 3 + a 5-card Lord pool needs 26 generals; Standard has 25.
    const candidates = dealCandidates(ids(8), '0', identityRng);

    expect(candidates['0'].length).toBeLessThan(LORD_CANDIDATES);
    expect(candidates['0'].length).toBeGreaterThan(PLAYER_CANDIDATES); // still the widest pool
    for (const id of ids(8).slice(1)) {
      expect(candidates[id]).toHaveLength(PLAYER_CANDIDATES);
    }
    expect(Object.values(candidates).flat()).toHaveLength(25);
  });
});

describe('initSelection', () => {
  it('deals roles and reveals the Lord, but deals nothing else', () => {
    const { G } = startedGame(5);

    expect(Object.values(G.players).filter((p) => p.role === 'lord')).toHaveLength(1);
    expect(G.players[lordOf(G)].roleRevealed).toBe(true);
    expect(Object.values(G.players).filter((p) => p.roleRevealed)).toHaveLength(1);

    for (const p of Object.values(G.players)) {
      expect(p.hand).toEqual([]);
      expect(p.generalId).toBe('');
      expect(p.hp).toBe(0);
      expect(p.maxHp).toBe(0);
    }
    expect(G.drawPile).toHaveLength(107);
    expect(G.stack).toEqual([]);
    expect(G.pending).toBeNull();
  });

  it('waits on the Lord alone — nobody else picks until they have revealed', () => {
    const { G } = startedGame();
    expect(G.selection!.awaiting).toEqual([lordOf(G)]);
  });
});

describe('applyPick', () => {
  it('opens the floor to everyone else, at once, as soon as the Lord picks', () => {
    const { G } = startedGame();
    const lord = lordOf(G);

    expect(applyPick(G, lord, G.selection!.candidates[lord][0])).toBe(true);

    expect(G.selection!.picked[lord]).toBe(G.selection!.candidates[lord][0]);
    expect(G.selection!.awaiting.sort()).toEqual(G.seats.filter((id) => id !== lord).sort());
    expect(isSelectionComplete(G.selection!)).toBe(false);
  });

  it('refuses a pick before the Lord has revealed', () => {
    const { G } = startedGame();
    const other = G.seats.find((id) => id !== lordOf(G))!;

    expect(applyPick(G, other, G.selection!.candidates[other][0])).toBe(false);
    expect(G.selection!.picked).toEqual({});
  });

  it('refuses a general that is not one of *your* candidates', () => {
    const { G } = startedGame();
    const lord = lordOf(G);
    const other = G.seats.find((id) => id !== lord)!;

    // Someone else's card…
    expect(applyPick(G, lord, G.selection!.candidates[other][0])).toBe(false);
    // …and one that was never dealt at all.
    expect(applyPick(G, lord, 'not_a_general')).toBe(false);
    expect(G.selection!.picked).toEqual({});
  });

  it('refuses a second pick from a player who has already locked in', () => {
    const { G } = startedGame();
    const lord = lordOf(G);
    applyPick(G, lord, G.selection!.candidates[lord][0]);

    expect(applyPick(G, lord, G.selection!.candidates[lord][1])).toBe(false);
    expect(G.selection!.picked[lord]).toBe(G.selection!.candidates[lord][0]);
  });

  it('is complete only once the last player has picked', () => {
    const { G } = startedGame();
    const lord = lordOf(G);
    applyPick(G, lord, G.selection!.candidates[lord][0]);

    const others = G.seats.filter((id) => id !== lord);
    others.forEach((id, i) => {
      expect(isSelectionComplete(G.selection!)).toBe(false);
      applyPick(G, id, G.selection!.candidates[id][0]);
      expect(G.selection!.awaiting).toHaveLength(others.length - i - 1);
    });

    expect(isSelectionComplete(G.selection!)).toBe(true);
  });
});

describe('completeSelection', () => {
  it('refuses to deal a table someone is still choosing at', () => {
    const { G, rng } = startedGame();
    expect(() => completeSelection(G, rng)).toThrow(/still waiting on/);

    applyPick(G, lordOf(G), G.selection!.candidates[lordOf(G)][0]);
    expect(() => completeSelection(G, rng)).toThrow(/still waiting on/);
  });

  it('gives everyone their general, their HP (+1 for the Lord), and 4 cards', () => {
    const { G, rng } = startedGame();
    const lord = lordOf(G);
    applyPick(G, lord, G.selection!.candidates[lord][0]);
    const picks: Record<string, string> = { [lord]: G.selection!.picked[lord] };
    for (const id of G.seats.filter((s) => s !== lord)) {
      const pick = G.selection!.candidates[id][0];
      picks[id] = pick;
      applyPick(G, id, pick);
    }

    completeSelection(G, rng);

    expect(G.selection).toBeNull();
    for (const id of G.seats) {
      const player = G.players[id];
      const general = generals.find((g) => g.id === picks[id])!;
      expect(player.generalId).toBe(picks[id]);
      expect(player.maxHp).toBe(general.maxHp + (id === lord ? 1 : 0));
      expect(player.hp).toBe(player.maxHp);
      expect(player.hand).toHaveLength(4);
    }
    expect(G.drawPile).toHaveLength(107 - 4 * G.seats.length);
  });

  it('starts turn 1 with the Lord — not seat 0, who is just whoever took it', () => {
    const { G, rng } = startedGame(6, reverseRng);
    expect(lordOf(G)).not.toBe('0'); // the point of the test
    const lord = lordOf(G);
    applyPick(G, lord, G.selection!.candidates[lord][0]);
    for (const id of G.seats.filter((s) => s !== lord)) {
      applyPick(G, id, G.selection!.candidates[id][0]);
    }

    completeSelection(G, rng);

    expect(G.seats[G.activeSeat]).toBe(lord);
    expect(G.turnPhase).toBe('prep');
    expect(G.stack).toEqual([{ t: 'phase', phase: 'prep' }]);
  });
});
