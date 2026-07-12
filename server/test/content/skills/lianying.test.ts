// 连营 (4.3 / Batch B) — draw 1 whenever your hand hits ZERO. Task 4.5.
//
// `when()` re-reads hand.length off LIVE G rather than trusting the event
// payload — 制衡 can drop several cards at once, and the event only says "a
// card left".

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { lianying } from '../../../src/content/skills/lianying.js';

const trigger = lianying.triggers![0];

const lost = (over: Record<string, unknown> = {}) =>
  ({ event: 'card.lost', player: '0', cards: ['strike_2c'], from: 'hand', ...over }) as never;

function state(hand: string[]) {
  return makeGState({ players: { '0': makePlayer('0', { hand }), '1': makePlayer('1') } });
}

describe('lianying — card.lost, but only at zero', () => {
  it('fires when the owner\'s hand is now empty', () => {
    expect(trigger.when(lost(), state([]), '0')).toBe(true);
  });

  it('does not fire while a card remains', () => {
    expect(trigger.when(lost(), state(['peach_3h']), '0')).toBe(false);
  });

  it('fires once for a multi-card discard that emptied the hand (制衡) — the live check, not the payload', () => {
    expect(trigger.when(lost({ cards: ['strike_2c', 'peach_3h'] }), state([]), '0')).toBe(true);
  });

  it('only listens to the HAND — losing your last piece of equipment is 枭姬\'s event, not this one', () => {
    expect(trigger.when(lost({ from: 'equip' }), state([]), '0')).toBe(false);
    expect(trigger.when(lost({ from: 'judgementZone' }), state([]), '0')).toBe(false);
  });

  it('ignores another player emptying out', () => {
    expect(trigger.when(lost({ player: '1' }), state([]), '0')).toBe(false);
  });

  it('draws exactly one', () => {
    expect(trigger.effect(lost(), state([]), '0')).toEqual([{ t: 'draw', player: '0', count: 1 }]);
    expect(trigger.optional).toBe(true);
  });
});
