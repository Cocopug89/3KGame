// 国色 (4.4 / Batch C, the 3.4 pickup) — any Diamond is 乐不思蜀. Task 4.5.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { guose } from '../../../src/content/skills/guose.js';

function cardDef(suit: string, effectKey = 'x') {
  return { suit, effectKey } as never;
}

describe('guose.cardsAs — a Diamond is 乐不思蜀', () => {
  const G = makeGState();

  it('permits a diamond as an indulgence', () => {
    expect(guose.queries!.cardsAs!(G, '0', [cardDef('diamonds')], 'indulgence')).toBe(true);
  });

  it('refuses the other three suits — DIAMONDS only, not "red"', () => {
    expect(guose.queries!.cardsAs!(G, '0', [cardDef('hearts')], 'indulgence')).toBe(false);
    expect(guose.queries!.cardsAs!(G, '0', [cardDef('spades')], 'indulgence')).toBe(false);
    expect(guose.queries!.cardsAs!(G, '0', [cardDef('clubs')], 'indulgence')).toBe(false);
  });

  it('refuses a diamond claimed as anything else', () => {
    expect(guose.queries!.cardsAs!(G, '0', [cardDef('diamonds')], 'dodge')).toBe(false);
    expect(guose.queries!.cardsAs!(G, '0', [cardDef('diamonds')], 'lightning')).toBe(false);
  });
});
