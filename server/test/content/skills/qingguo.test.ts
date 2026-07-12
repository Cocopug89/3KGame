// 倾国 (4.2 / Batch A) — a black card is a 闪. Task 4.5.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { qingguo } from '../../../src/content/skills/qingguo.js';

function cardDef(suit: string, effectKey = 'x') {
  return { suit, effectKey } as never;
}

describe('qingguo.cardsAs — any black card as a 闪', () => {
  const G = makeGState();

  it('permits clubs and spades as a dodge', () => {
    expect(qingguo.queries!.cardsAs!(G, '0', [cardDef('clubs')], 'dodge')).toBe(true);
    expect(qingguo.queries!.cardsAs!(G, '0', [cardDef('spades')], 'dodge')).toBe(true);
  });

  it('refuses red cards — 倾国 is the colour-mirror of 武圣', () => {
    expect(qingguo.queries!.cardsAs!(G, '0', [cardDef('hearts')], 'dodge')).toBe(false);
    expect(qingguo.queries!.cardsAs!(G, '0', [cardDef('diamonds')], 'dodge')).toBe(false);
  });

  it('refuses any claim other than dodge', () => {
    expect(qingguo.queries!.cardsAs!(G, '0', [cardDef('spades')], 'strike')).toBe(false);
  });

  it('requires every card of a multi-card claim to be black', () => {
    expect(qingguo.queries!.cardsAs!(G, '0', [cardDef('spades'), cardDef('hearts')], 'dodge')).toBe(false);
  });
});
