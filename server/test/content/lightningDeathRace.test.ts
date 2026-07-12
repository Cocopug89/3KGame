// Repro of the 7.2 soak crash: 闪电 hits a holder at 3 hp, the damage kills
// them, resolveDeath sweeps the judgement zone into the discard pile — and the
// cleanup moveCards queued BEHIND the damage frame then popped against a zone
// the card had already left ("moveCards: lightning_as is not in 1's judgement
// zone"). moveCards has no subject, so the dead-subject rule can't drop it.
// The fix orders the discard BEFORE the damage frame in lightningResult.
import { describe, expect, it } from 'vitest';
import { makeGState, makePlayer, identityRng } from '../engine/fixtures.js';
import { pump } from '../../src/engine/pump.js';

describe('lightning killing its own holder', () => {
  it('resolves the hit without a moveCards crash and discards the card once', () => {
    const G = makeGState({
      players: {
        '0': makePlayer('0'),
        '1': makePlayer('1', { hp: 3, judgementZone: ['lightning_as'] }),
      },
      // ♠7 on top = a hit. No peaches anywhere, so the dying window closes.
      drawPile: ['strike_7s', 'dodge_2h', 'dodge_2d1', 'dodge_2d2'],
      activeSeat: 1,
    });
    G.stack.push({
      t: 'judge',
      target: '1',
      reasonKey: 'judge.lightning',
      card: 'lightning_as',
      onResult: 'lightning_result',
    });

    expect(() => pump(G, identityRng)).not.toThrow();
    expect(G.players['1'].alive).toBe(false);
    expect(G.discardPile).toContain('lightning_as');
    // Exactly once — not duplicated by the death sweep.
    expect(G.discardPile.filter((c) => c === 'lightning_as')).toHaveLength(1);
  });
});
