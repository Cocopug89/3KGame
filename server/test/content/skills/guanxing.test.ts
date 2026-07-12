// 观星 (4.4 / Batch C) — look at the top min(living, 5) cards of the draw pile
// and put them back in an order of your choosing. Task 4.5.
//
// PRIVATE REVEAL, NO NEW MECHANISM (§6): the ids ride in the `guanxing`
// PendingRequest payload, which playerView only ever sends to pending.playerId.
// The cards never leave G.drawPile — nothing public is written, which is
// exactly what 5.4's anti-cheat audit will be looking for.
//
// ⚠️ Documented v1 simplification (guanxing.ts's own header): the real skill
// splits the N cards between the top and the BOTTOM of the pile; this version
// reorders the top N among themselves. The tests pin what is implemented.

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { guanxing } from '../../../src/content/skills/guanxing.js';

const trigger = guanxing.triggers![0];

const prep = (player = '0') => ({ event: 'phase.start', phase: 'prep', player }) as never;

function state(drawPile: string[], living = 2) {
  const players: Record<string, ReturnType<typeof makePlayer>> = {};
  const seats: string[] = [];
  for (let i = 0; i < 5; i++) {
    const id = String(i);
    players[id] = makePlayer(id, { alive: i < living });
    seats.push(id);
  }
  return makeGState({ players, seats, drawPile });
}

describe('guanxing — the prep-phase trigger', () => {
  it('fires at the start of the owner\'s prep phase', () => {
    expect(trigger.when(prep(), state(['a', 'b', 'c']), '0')).toBe(true);
  });

  it('does not fire on another phase, another player\'s prep, or an empty draw pile', () => {
    const G = state(['a']);
    expect(trigger.when({ event: 'phase.start', phase: 'draw', player: '0' } as never, G, '0')).toBe(false);
    expect(trigger.when(prep('1'), G, '0')).toBe(false);
    expect(trigger.when(prep(), state([]), '0')).toBe(false);
  });
});

describe('guanxing — how many cards it shows', () => {
  it('shows min(5, living players, draw pile) — capped by the living count', () => {
    const G = state(['a', 'b', 'c', 'd', 'e', 'f'], 3); // 3 alive
    expect(trigger.effect(prep(), G, '0')).toEqual([
      { t: 'request', req: { kind: 'guanxing', playerId: '0', cards: ['a', 'b', 'c'], reasonKey: 'skill.guanxing' } },
    ]);
  });

  it('caps at five even in a full eight-player game\'s worth of draw pile', () => {
    const G = state(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 5);
    const frames = trigger.effect(prep(), G, '0') as unknown as Array<{ req: { cards: string[] } }>;
    expect(frames[0].req.cards).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('shows only what the pile actually holds when it is nearly empty', () => {
    const G = state(['a'], 5);
    const frames = trigger.effect(prep(), G, '0') as unknown as Array<{ req: { cards: string[] } }>;
    expect(frames[0].req.cards).toEqual(['a']);
  });

  it('takes the cards from the TOP of the pile and does not move them anywhere', () => {
    const G = state(['a', 'b', 'c'], 2);
    const frames = trigger.effect(prep(), G, '0');
    expect(frames).toHaveLength(1); // a request and nothing else — no moveCards
    expect(frames[0].t).toBe('request');
    expect(G.drawPile).toEqual(['a', 'b', 'c']); // resolve() never mutates G
  });

  it('is optional', () => {
    expect(trigger.optional).toBe(true);
  });
});
