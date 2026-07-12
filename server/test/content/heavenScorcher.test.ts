// 方天画戟 (task 3.6) — targetLimit query: +2 targets for a 杀 played as the
// owner's LAST hand card. bgio's playCard validates targets BEFORE
// discarding, so hand.length === 1 at query time means the 杀 under
// consideration IS the only card left.

import { describe, it, expect } from 'vitest';
import { heavenScorcherQuery } from '../../src/content/effects/heavenScorcher.js';
import { makeGState, makePlayer } from '../engine/fixtures.js';

describe('heavenScorcherQuery.targetLimit', () => {
  it('adds +2 when the 杀 being played is the only card left in hand', () => {
    const G = makeGState({ players: { '0': makePlayer('0', { hand: ['strike_2c'] }) } });
    expect(heavenScorcherQuery.targetLimit!(G, '0', 'strike', 1)).toBe(3);
  });

  it('leaves the limit untouched with more than one card in hand', () => {
    const G = makeGState({ players: { '0': makePlayer('0', { hand: ['strike_2c', 'dodge_2h1'] }) } });
    expect(heavenScorcherQuery.targetLimit!(G, '0', 'strike', 1)).toBe(1);
  });

  it('leaves the limit untouched for any effectKey other than strike, even at 1 card left', () => {
    const G = makeGState({ players: { '0': makePlayer('0', { hand: ['duel_ad'] }) } });
    expect(heavenScorcherQuery.targetLimit!(G, '0', 'duel', 1)).toBe(1);
  });

  it('treats a nonexistent player as an empty hand (defensive default)', () => {
    const G = makeGState();
    expect(heavenScorcherQuery.targetLimit!(G, 'ghost', 'strike', 1)).toBe(1);
  });
});
