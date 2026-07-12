// 武圣 (4.2 / Batch A) — a red card is a 杀.
// Task 4.5. Style follows server/test/content/batchC.test.ts: call the query
// handler directly against a hand-built GState, no server/socket/mocks
// (engine-design §8).

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { wusheng } from '../../../src/content/skills/wusheng.js';

function cardDef(suit: string, effectKey = 'x') {
  return { suit, effectKey } as never; // CardDef stub — only `suit`/`effectKey` are read
}

describe('wusheng.cardsAs — any red card as a 杀', () => {
  const G = makeGState();

  it('permits hearts and diamonds as a strike', () => {
    expect(wusheng.queries!.cardsAs!(G, '0', [cardDef('hearts')], 'strike')).toBe(true);
    expect(wusheng.queries!.cardsAs!(G, '0', [cardDef('diamonds')], 'strike')).toBe(true);
  });

  it('refuses black cards', () => {
    expect(wusheng.queries!.cardsAs!(G, '0', [cardDef('spades')], 'strike')).toBe(false);
    expect(wusheng.queries!.cardsAs!(G, '0', [cardDef('clubs')], 'strike')).toBe(false);
  });

  it('refuses any claim other than strike — 武圣 is not 龙胆', () => {
    expect(wusheng.queries!.cardsAs!(G, '0', [cardDef('hearts')], 'dodge')).toBe(false);
    expect(wusheng.queries!.cardsAs!(G, '0', [cardDef('hearts')], 'peach')).toBe(false);
  });

  it('requires EVERY card in a multi-card claim to be red (the array form 丈八蛇矛 uses)', () => {
    expect(wusheng.queries!.cardsAs!(G, '0', [cardDef('hearts'), cardDef('diamonds')], 'strike')).toBe(true);
    expect(wusheng.queries!.cardsAs!(G, '0', [cardDef('hearts'), cardDef('spades')], 'strike')).toBe(false);
  });

  it('is not 锁定技 — the player claims, the query only permits (§4.1)', () => {
    expect(wusheng.locked).toBe(false);
  });
});
