// 丈八蛇矛 (task 3.6) — a pure cardsAs permission: exactly two hand cards may
// together be claimed as one 杀. No range/suit/rank restriction on which two.

import { describe, it, expect } from 'vitest';
import { serpentSpearQuery } from '../../src/content/effects/serpentSpear.js';
import { makeGState } from '../engine/fixtures.js';
import { getCard } from '../../src/engine/cardIndex.js';

describe('serpentSpearQuery.cardsAs', () => {
  const G = makeGState();
  const two = [getCard('strike_2c'), getCard('dodge_2h1')];
  const one = [getCard('strike_2c')];

  it('permits exactly two cards claimed as a 杀', () => {
    expect(serpentSpearQuery.cardsAs!(G, '0', two, 'strike')).toBe(true);
  });

  it('refuses one card, or three, claimed as a 杀', () => {
    expect(serpentSpearQuery.cardsAs!(G, '0', one, 'strike')).toBe(false);
    expect(serpentSpearQuery.cardsAs!(G, '0', [...two, getCard('strike_3c')], 'strike')).toBe(false);
  });

  it('refuses two cards claimed as anything OTHER than a 杀', () => {
    expect(serpentSpearQuery.cardsAs!(G, '0', two, 'dodge')).toBe(false);
  });
});
