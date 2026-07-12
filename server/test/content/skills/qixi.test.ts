// 奇袭 (4.2 / Batch A) — a black card is 过河拆桥. Task 4.5.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { qixi } from '../../../src/content/skills/qixi.js';

function cardDef(suit: string, effectKey = 'x') {
  return { suit, effectKey } as never;
}

describe('qixi.cardsAs — any black card as 过河拆桥', () => {
  const G = makeGState();

  it('permits clubs and spades as a dismantle', () => {
    expect(qixi.queries!.cardsAs!(G, '0', [cardDef('clubs')], 'dismantle')).toBe(true);
    expect(qixi.queries!.cardsAs!(G, '0', [cardDef('spades')], 'dismantle')).toBe(true);
  });

  it('refuses red cards', () => {
    expect(qixi.queries!.cardsAs!(G, '0', [cardDef('hearts')], 'dismantle')).toBe(false);
    expect(qixi.queries!.cardsAs!(G, '0', [cardDef('diamonds')], 'dismantle')).toBe(false);
  });

  it('refuses a black card claimed as anything else — it is 过河拆桥 only, not 顺手牵羊', () => {
    expect(qixi.queries!.cardsAs!(G, '0', [cardDef('spades')], 'steal')).toBe(false);
    expect(qixi.queries!.cardsAs!(G, '0', [cardDef('spades')], 'dodge')).toBe(false);
  });
});
