// 流离 (4.4 / Batch C) — when a 杀 targets you, discard a card to move it onto
// someone else in YOUR attack range (never back onto the 杀's user). Task 4.5.
//
// ⚠️ Two documented simplifications live in liuli.ts's header, and this file
// pins the behaviour as implemented, not as the paper rules read: (1) a redirect
// cannot be chained by the new target, and (2) 铁骑 + 流离 on the same 杀 both
// apply. Neither is reachable with the Standard 25.

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import type { GState } from '../../../src/engine/state.js';
import { liuli } from '../../../src/content/skills/liuli.js';

const trigger = liuli.triggers![0];

/** 0 strikes 1 (大乔). 2 is a legal redirect candidate at distance 1. */
function state(): GState {
  return makeGState({
    players: {
      '0': makePlayer('0'),
      '1': makePlayer('1', { hand: ['strike_2c'] }),
      '2': makePlayer('2'),
    },
    seats: ['0', '1', '2'],
  });
}

const ev = (over: Record<string, unknown> = {}) =>
  ({ event: 'card.target', source: '0', target: '1', effectKey: 'strike', cards: ['strike_2c'], ...over }) as never;

describe('liuli — card.target, on the 杀\'s TARGET (not its source)', () => {
  it('fires for the target of a strike who holds a card and has a legal redirect', () => {
    expect(trigger.when(ev(), state(), '1')).toBe(true);
  });

  it('does not fire for the strike\'s own source', () => {
    expect(trigger.when(ev(), state(), '0')).toBe(false);
  });

  it('does not fire with an empty hand — the discard IS the cost', () => {
    const G = state();
    G.players['1'].hand = [];
    expect(trigger.when(ev(), G, '1')).toBe(false);
  });

  it('does not fire for a 决斗 or another card — 流离 answers 杀 only', () => {
    expect(trigger.when(ev({ effectKey: 'duel' }), state(), '1')).toBe(false);
  });

  it('does not fire when nobody else is in range to receive it', () => {
    const G = makeGState({
      players: { '0': makePlayer('0'), '1': makePlayer('1', { hand: ['strike_2c'] }) },
      seats: ['0', '1'],
    });
    expect(trigger.when(ev(), G, '1')).toBe(false); // only the source is left, and he is excluded
  });

  it('offers every OTHER living player in range, never the original source', () => {
    expect(trigger.effect(ev(), state(), '1')).toEqual([
      { t: 'request', req: { kind: 'liuliRedirect', playerId: '1', candidates: ['2'], reasonKey: 'skill.liuli' } },
    ]);
  });

  it('excludes the dead from the candidate list', () => {
    const G = state();
    G.players['2'].alive = false;
    const frames = trigger.effect(ev(), G, '1') as unknown as Array<{ req: { candidates: string[] } }>;
    expect(frames[0].req.candidates).toEqual([]);
  });

  it('is optional', () => {
    expect(trigger.optional).toBe(true);
  });
});
