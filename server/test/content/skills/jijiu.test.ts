// 急救 (4.4 / Batch C) — outside your own turn, any RED card is a 桃. Task 4.5.
//
// §11's cross-check correction: this is a plain cardsAs query, NOT a
// demand.open proxy — 华佗 answers the dying window with a red card himself.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { jijiu } from '../../../src/content/skills/jijiu.js';

function cardDef(suit: string, effectKey = 'x') {
  return { suit, effectKey } as never;
}

describe('jijiu.cardsAs — a red card is a 桃, but not on your own turn', () => {
  it('permits red cards when it is not the owner\'s turn', () => {
    const G = makeGState({ activeSeat: 1 }); // seats[1] = '1' is the turn player
    expect(jijiu.queries!.cardsAs!(G, '0', [cardDef('hearts')], 'peach')).toBe(true);
    expect(jijiu.queries!.cardsAs!(G, '0', [cardDef('diamonds')], 'peach')).toBe(true);
  });

  it('refuses on the owner\'s OWN turn — the whole point of the restriction', () => {
    const G = makeGState({ activeSeat: 0 });
    expect(jijiu.queries!.cardsAs!(G, '0', [cardDef('hearts')], 'peach')).toBe(false);
  });

  it('refuses black cards, and refuses any claim other than 桃', () => {
    const G = makeGState({ activeSeat: 1 });
    expect(jijiu.queries!.cardsAs!(G, '0', [cardDef('spades')], 'peach')).toBe(false);
    expect(jijiu.queries!.cardsAs!(G, '0', [cardDef('clubs')], 'peach')).toBe(false);
    expect(jijiu.queries!.cardsAs!(G, '0', [cardDef('hearts')], 'dodge')).toBe(false);
    expect(jijiu.queries!.cardsAs!(G, '0', [cardDef('hearts')], 'strike')).toBe(false);
  });
});
