// 7.2 first-deploy crash: a redeploy wipes the in-memory match store, a stale
// browser tab re-syncs to its old matchID, and boardgame.io's Master.onSync
// RE-CREATES the missing match with its own default numPlayers — 2. setup()
// used to let initGame's 4–8 assert throw, the throw escaped onSync, and the
// whole server process died in a loop re-armed by every stale tab. setup()
// must therefore NEVER throw on a bad player count: it returns an already-over
// tombstone the stale client renders as a finished game.

import { describe, it, expect } from 'vitest';
import { ThreeKingdomsGame } from '../../src/bgio/game.js';

function setupWith(numPlayers: number) {
  const playOrder = Array.from({ length: numPlayers }, (_, i) => String(i));
  // The tombstone path returns before touching the rng, which is the point:
  // no random object is even needed to survive the bad count.
  return ThreeKingdomsGame.setup!(
    { ctx: { playOrder, numPlayers }, random: undefined } as never,
    undefined,
  );
}

describe("setup() on boardgame.io's own default (stale-sync) player counts", () => {
  it('returns an already-over tombstone for 2 players instead of throwing', () => {
    const G = setupWith(2);
    expect(G.gameOver).toEqual({ winners: [], condition: 'lord' });
    expect(G.players).toEqual({});
    expect(G.pending).toBeNull();
    expect(G.stack).toEqual([]);
  });

  it('same for any count outside 4-8', () => {
    for (const n of [1, 3, 9]) {
      expect(setupWith(n).gameOver, `numPlayers=${n}`).toBeTruthy();
    }
  });

  it('a real 4-player setup still deals a live game', () => {
    const playOrder = ['0', '1', '2', '3'];
    // Minimal Random-plugin shim: initGame shuffles the deck and role deal.
    const random = {
      Shuffle: <T,>(arr: T[]) => [...arr],
    };
    const G = ThreeKingdomsGame.setup!(
      { ctx: { playOrder, numPlayers: 4 }, random } as never,
      undefined,
    );
    expect(G.gameOver).toBeUndefined();
    expect(Object.keys(G.players)).toHaveLength(4);
  });
});
