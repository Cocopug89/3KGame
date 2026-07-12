// 奸雄 (4.3 / Batch B) — after damage from a card, take that card. Task 4.5.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { jianxiong } from '../../../src/content/skills/jianxiong.js';

const trigger = jianxiong.triggers![0];

const dmg = (over: Record<string, unknown> = {}) =>
  ({
    event: 'damage.after',
    source: '1',
    target: '0',
    amount: 1,
    kind: 'normal',
    card: 'strike_2c',
    seq: 1,
    ...over,
  }) as never;

describe('jianxiong — damage.after, only when there is a card to take', () => {
  it('fires for damage dealt to the owner by a card sitting in the discard pile', () => {
    const G = makeGState({ discardPile: ['strike_2c'] });
    expect(trigger.when(dmg(), G, '0')).toBe(true);
  });

  it('does not fire for damage to somebody else', () => {
    const G = makeGState({ discardPile: ['strike_2c'] });
    expect(trigger.when(dmg({ target: '1' }), G, '0')).toBe(false);
  });

  it('does not prompt for card-less damage — AoE and 决斗\'s backfire have nothing to gain (§3.4)', () => {
    const G = makeGState({ discardPile: ['strike_2c'] });
    expect(trigger.when(dmg({ card: undefined }), G, '0')).toBe(false);
  });

  it('does not fire when the card is no longer in the discard pile', () => {
    const G = makeGState({ discardPile: [] });
    expect(trigger.when(dmg(), G, '0')).toBe(false);
  });

  it('lifts the card out of the discard pile into the owner\'s hand, and logs it', () => {
    const G = makeGState({ discardPile: ['peach_3h', 'strike_2c'] });
    expect(trigger.effect(dmg(), G, '0')).toEqual([
      {
        t: 'moveCards',
        cards: ['strike_2c'],
        from: { z: 'discard' },
        to: { z: 'hand', player: '0' },
        by: '0',
      },
      { t: 'log', key: 'log.picks', params: { player: '0', card: 'strike_2c' } },
    ]);
  });

  it('is optional', () => {
    expect(trigger.optional).toBe(true);
    expect(trigger.event).toBe('damage.after');
  });
});
