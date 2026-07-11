// Judgement (判定) — docs/judgement-nullification-design.md §1. Task 3.2.
//
// The whole point of the design is that a judgement is NOT "read a card": it's
// flip → retrial hole → read → onResult → discard, and every step is
// observable. These tests pin each step, plus the retrial mechanism 鬼才 (4.4)
// will hang off without touching any of this code.

import { describe, it, expect, afterEach } from 'vitest';
import { pump, resolve } from '../../src/engine/pump.js';
import { effectRegistry } from '../../src/content/effectRegistry.js';
import { makeGState, identityRng } from './fixtures.js';
import type { GState } from '../../src/engine/state.js';

/** A throwaway result handler, registered for the length of one test — the
 * same trick 3.4 will use for real (`indulgence_result`, `lightning_result`).
 * It records what the judgement said. */
function registerResultSpy(key: string, seen: { judgeCard?: string; target?: string }) {
  effectRegistry[key] = {
    key,
    targeting: { min: 0, max: 0, self: 'only' },
    canPlay: () => false,
    resolve: (_G, ctx) => {
      seen.judgeCard = ctx.judgeCard as string;
      seen.target = ctx.target as string;
      return [];
    },
  };
}

const TEMP_KEYS = ['spy_result', 'spy_result_2'];
afterEach(() => {
  for (const k of TEMP_KEYS) delete effectRegistry[k];
});

function judging(): GState {
  const G = makeGState({ drawPile: ['peach_3h', 'strike_2c', 'dodge_2h1'] });
  return G;
}

describe("resolve('judge')", () => {
  it('flips the top card into the public G.judgement field and opens the retrial window', () => {
    const G = judging();
    resolve(
      { t: 'judge', target: '0', reasonKey: 'judge.indulgence', onResult: 'spy_result', card: 'indulgence_6h' },
      G,
      identityRng,
    );

    // Lifted OUT of the draw pile, not peeked in place: the instant it's
    // flipped it stops being hidden information (§1.2 / engine-design §6).
    expect(G.drawPile).toEqual(['strike_2c', 'dodge_2h1']);
    expect(G.judgement).toEqual({
      target: '0',
      cardId: 'peach_3h',
      reasonKey: 'judge.indulgence',
      sourceCard: 'indulgence_6h',
    });

    // Narrative order: the retrial window (a plain trigger fan-out) pops
    // FIRST, and only then is the result read.
    expect(G.stack).toHaveLength(2);
    expect(G.stack[1]).toMatchObject({ t: 'trigger', ev: { event: 'judge.card', target: '0' } });
    expect(G.stack[0]).toMatchObject({ t: 'judgeResult', onResult: 'spy_result' });
  });

  it('reshuffles the discard pile in when the draw pile is empty (a judgement always has a card)', () => {
    const G = makeGState({ drawPile: [], discardPile: ['peach_3h'] });
    resolve({ t: 'judge', target: '0', reasonKey: 'r', onResult: 'spy_result' }, G, identityRng);
    expect(G.judgement!.cardId).toBe('peach_3h');
    expect(G.discardPile).toEqual([]);
  });

  it('drops for a dead target (the dead-subject rule), flipping nothing', () => {
    const G = judging();
    G.players['0'].alive = false;
    resolve({ t: 'judge', target: '0', reasonKey: 'r', onResult: 'spy_result' }, G, identityRng);
    expect(G.judgement).toBeNull();
    expect(G.drawPile).toHaveLength(3);
    expect(G.stack).toEqual([]);
  });
});

describe("resolve('judgeResult')", () => {
  it('clears the judgement, discards the card, and dispatches onResult with the final card', () => {
    const seen: { judgeCard?: string; target?: string } = {};
    registerResultSpy('spy_result', seen);

    const G = judging();
    G.stack.push({
      t: 'judge',
      target: '0',
      reasonKey: 'judge.indulgence',
      onResult: 'spy_result',
      card: 'indulgence_6h',
    });
    pump(G, identityRng);

    expect(seen).toEqual({ judgeCard: 'peach_3h', target: '0' }); // the handler read the flipped card
    expect(G.judgement).toBeNull(); // window closed
    expect(G.discardPile).toContain('peach_3h'); // 判定牌在判定结果结算后弃置
    expect(G.stack).toEqual([]);
  });
});

describe("resolve('retrial') — 改判", () => {
  it('replaces the judgement card, discards the old one, and RE-OPENS the window (retrials chain)', () => {
    const G = judging();
    G.judgement = { target: '0', cardId: 'peach_3h', reasonKey: 'judge.indulgence' };

    resolve({ t: 'retrial', source: '1', card: 'strike_2c' }, G, identityRng);

    expect(G.judgement!.cardId).toBe('strike_2c'); // the replacement IS the judgement card now
    expect(G.discardPile).toEqual(['peach_3h']); // the old one goes immediately
    // Re-fired, so a SECOND retrial skill can answer the first — the rule that
    // makes 鬼才-vs-鬼才 work with no judgement-specific machinery at all.
    expect(G.stack).toEqual([
      { t: 'trigger', ev: { event: 'judge.card', target: '0', reasonKey: 'judge.indulgence' } },
    ]);
  });

  it('a retrial mid-window changes what onResult actually reads', () => {
    const seen: { judgeCard?: string } = {};
    registerResultSpy('spy_result', seen);

    const G = judging();
    // Hand-build the exact stack a 鬼才 trigger would leave behind: the retrial
    // sits above the judgeResult that will read the (replaced) card.
    G.judgement = { target: '0', cardId: 'peach_3h', reasonKey: 'r' };
    G.stack.push({ t: 'judgeResult', target: '0', reasonKey: 'r', onResult: 'spy_result' });
    G.stack.push({ t: 'retrial', source: '1', card: 'dodge_2h1' });
    pump(G, identityRng);

    expect(seen.judgeCard).toBe('dodge_2h1'); // NOT peach_3h — the retrial won
    expect(G.discardPile).toEqual(['peach_3h', 'dodge_2h1']); // both cards end up discarded
  });

  it('throws if it pops with no judgement in flight (a frame ordering bug, not a rules case)', () => {
    const G = judging();
    expect(() => resolve({ t: 'retrial', source: '1', card: 'strike_2c' }, G, identityRng)).toThrow(
      /no judgement in flight/,
    );
  });
});
