import { describe, it, expect } from 'vitest';
import { buildDeck, shuffleDeck, drawCards, discardFromHand, handLimitOverflow } from '../../src/engine/deck.js';
import { makeGState, identityRng, reverseRng } from './fixtures.js';

describe('buildDeck', () => {
  it('returns all 107 standard-edition card ids, each unique', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(107);
    expect(new Set(deck).size).toBe(107);
  });
});

describe('shuffleDeck', () => {
  it('delegates to the injected RNG and does not mutate the input', () => {
    const input = ['a', 'b', 'c'];
    const out = shuffleDeck(input, reverseRng);
    expect(out).toEqual(['c', 'b', 'a']);
    expect(input).toEqual(['a', 'b', 'c']); // untouched
  });
});

describe('drawCards', () => {
  it('moves cards from the top (index 0) of the draw pile into the hand', () => {
    const G = makeGState({ drawPile: ['a', 'b', 'c', 'd'] });
    const drawn = drawCards(G, '0', 2, identityRng);
    expect(drawn).toEqual(['a', 'b']);
    expect(G.players['0'].hand).toEqual(['a', 'b']);
    expect(G.drawPile).toEqual(['c', 'd']);
  });

  it('reshuffles the discard pile into the draw pile when it empties mid-draw', () => {
    const G = makeGState({ drawPile: ['a'], discardPile: ['b', 'c'] });
    const drawn = drawCards(G, '0', 3, identityRng);
    expect(drawn).toEqual(['a', 'b', 'c']);
    expect(G.discardPile).toEqual([]);
    expect(G.drawPile).toEqual([]);
  });

  it('stops early without throwing when both piles are empty (draw-game condition)', () => {
    const G = makeGState({ drawPile: [], discardPile: [] });
    const drawn = drawCards(G, '0', 3, identityRng);
    expect(drawn).toEqual([]);
    expect(G.players['0'].hand).toEqual([]);
  });

  it('never touches cards already in a hand — only drawPile/discardPile are recycled', () => {
    const G = makeGState({ drawPile: ['a'], discardPile: ['b'] });
    G.players['0'].hand = ['held'];
    drawCards(G, '0', 2, identityRng);
    expect(G.players['0'].hand).toEqual(['held', 'a', 'b']);
  });

  it('throws for an unknown player id', () => {
    const G = makeGState();
    expect(() => drawCards(G, '99', 1, identityRng)).toThrow();
  });
});

describe('discardFromHand', () => {
  it('moves cards from hand to the discard pile', () => {
    const G = makeGState();
    G.players['0'].hand = ['a', 'b', 'c'];
    discardFromHand(G, '0', ['b']);
    expect(G.players['0'].hand).toEqual(['a', 'c']);
    expect(G.discardPile).toEqual(['b']);
  });

  it('throws if the player does not hold the card (last-line invariant, not UX)', () => {
    const G = makeGState();
    G.players['0'].hand = ['a'];
    expect(() => discardFromHand(G, '0', ['z'])).toThrow();
  });
});

describe('handLimitOverflow', () => {
  it('is 0 when hand size is at or under current HP', () => {
    const G = makeGState();
    G.players['0'].hp = 3;
    G.players['0'].hand = ['a', 'b', 'c'];
    expect(handLimitOverflow(G, '0')).toBe(0);
  });

  it('counts cards over *current* HP, not max HP', () => {
    const G = makeGState();
    G.players['0'].maxHp = 4;
    G.players['0'].hp = 2; // wounded
    G.players['0'].hand = ['a', 'b', 'c', 'd'];
    expect(handLimitOverflow(G, '0')).toBe(2);
  });
});
