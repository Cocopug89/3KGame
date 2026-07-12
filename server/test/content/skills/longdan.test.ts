// 龙胆 (4.2 / Batch A) — a 杀 is a 闪 and a 闪 is a 杀. Task 4.5.
//
// Note this is the one Batch A cardsAs keyed off `effectKey`, not `suit`:
// 龙胆 converts by CARD TYPE, where 武圣/倾国/奇袭 convert by COLOUR.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { longdan } from '../../../src/content/skills/longdan.js';

function cardDef(effectKey: string, suit = 'spades') {
  return { suit, effectKey } as never;
}

describe('longdan.cardsAs — the two-way 杀/闪 swap', () => {
  const G = makeGState();

  it('plays a 闪 as a 杀', () => {
    expect(longdan.queries!.cardsAs!(G, '0', [cardDef('dodge')], 'strike')).toBe(true);
  });

  it('plays a 杀 as a 闪', () => {
    expect(longdan.queries!.cardsAs!(G, '0', [cardDef('strike')], 'dodge')).toBe(true);
  });

  it('does not let a 杀 be a 杀 or a 闪 be a 闪 through this query — the real card needs no permission', () => {
    expect(longdan.queries!.cardsAs!(G, '0', [cardDef('strike')], 'strike')).toBe(false);
    expect(longdan.queries!.cardsAs!(G, '0', [cardDef('dodge')], 'dodge')).toBe(false);
  });

  it('converts nothing else, and permits no other claim', () => {
    expect(longdan.queries!.cardsAs!(G, '0', [cardDef('peach')], 'strike')).toBe(false);
    expect(longdan.queries!.cardsAs!(G, '0', [cardDef('dodge')], 'peach')).toBe(false);
  });

  it('ignores suit entirely — a black 闪 is still a 杀', () => {
    expect(longdan.queries!.cardsAs!(G, '0', [cardDef('dodge', 'clubs')], 'strike')).toBe(true);
    expect(longdan.queries!.cardsAs!(G, '0', [cardDef('dodge', 'hearts')], 'strike')).toBe(true);
  });
});
