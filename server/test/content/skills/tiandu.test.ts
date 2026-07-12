// 天妒 (4.4 / Batch C) — take your own resolved judgement card. Task 4.5.
//
// By the time judge.result fires, judgeResult (pump.ts) has already pushed the
// judged card onto the discard pile — so "获得" is a plain lift back out, the
// same move 奸雄/洛神 make.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { tiandu } from '../../../src/content/skills/tiandu.js';

const trigger = tiandu.triggers![0];

describe('tiandu — judge.result on your OWN judgement', () => {
  it('fires for the owner\'s own judgement when there is a card to take', () => {
    const G = makeGState({ discardPile: ['strike_2c'] });
    expect(trigger.when({ event: 'judge.result', target: '0', reasonKey: 'judge.x' }, G, '0')).toBe(true);
  });

  it('does not fire for someone else\'s judgement', () => {
    const G = makeGState({ discardPile: ['strike_2c'] });
    expect(trigger.when({ event: 'judge.result', target: '1', reasonKey: 'judge.x' }, G, '0')).toBe(false);
  });

  it('does not fire on judge.CARD — the card is only takeable once the judgement has resolved', () => {
    const G = makeGState({ discardPile: ['strike_2c'] });
    expect(trigger.when({ event: 'judge.card', target: '0', reasonKey: 'judge.x' }, G, '0')).toBe(false);
  });

  it('takes the TOP of the discard pile — the card judgeResult just pushed', () => {
    const G = makeGState({ discardPile: ['peach_3h', 'strike_2c'] });
    expect(trigger.effect({ event: 'judge.result', target: '0', reasonKey: 'judge.x' }, G, '0')).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'discard' }, to: { z: 'hand', player: '0' }, by: '0' },
    ]);
  });

  it('is optional', () => {
    expect(trigger.optional).toBe(true);
  });
});
