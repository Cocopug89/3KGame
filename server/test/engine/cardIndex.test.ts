import { describe, it, expect } from 'vitest';
import { buildCardIndex, getCard, getCardIndex } from '../../src/engine/cardIndex.js';

describe('cardIndex', () => {
  it('indexes all 107 cards by id', () => {
    const index = buildCardIndex();
    expect(index.size).toBe(107);
  });

  it('getCard returns the right card def, including effectKey', () => {
    const card = getCard('strike_2c');
    expect(card.effectKey).toBe('strike');
    expect(card.enName).toBe('Strike');
  });

  it('gives weapons a range and non-weapons none', () => {
    const crossbow = getCard('zhuge_crossbow_ad');
    expect(crossbow.range).toBe(1);
    const dodge = getCard('dodge_2h1');
    expect(dodge.range).toBeUndefined();
  });

  it('groups horses by direction (plus_horse / minus_horse), not by card name', () => {
    expect(getCard('shadow_5s').effectKey).toBe('plus_horse'); // 绝影, +1
    expect(getCard('red_hare_5h').effectKey).toBe('minus_horse'); // 赤兔, -1
  });

  it('throws for an unknown id', () => {
    expect(() => getCard('not_a_real_card')).toThrow();
  });

  it('memoises getCardIndex() (same reference across calls)', () => {
    expect(getCardIndex()).toBe(getCardIndex());
  });
});
