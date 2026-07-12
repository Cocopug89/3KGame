// 集智 (4.3 / Batch B) — draw 1 whenever you play a non-delayed trick. Task 4.5.
//
// Keyed off `effectKey`, not the physical card type, so 视为 conversions count:
// 甘宁's 奇袭 (a black BASIC card played AS 过河拆桥) fires this, because
// `cardsAs` already validated the claim before card.play was emitted (§4.1).

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { jizhi } from '../../../src/content/skills/jizhi.js';

const trigger = jizhi.triggers![0];

const play = (effectKey: string, source = '0', cards: string[] = ['dismantle_3s']) =>
  ({ event: 'card.play', source, cards, targets: [], effectKey }) as never;

describe('jizhi — card.play, non-delayed tricks only', () => {
  const G = makeGState();

  it('fires for every non-delayed trick', () => {
    for (const key of [
      'barbarian_invasion',
      'dismantle',
      'draw_two',
      'duel',
      'duress',
      'harvest',
      'peach_garden',
      'raining_arrows',
      'steal',
    ]) {
      expect(trigger.when(play(key), G, '0')).toBe(true);
    }
  });

  it('does NOT fire for the two delayed tricks', () => {
    expect(trigger.when(play('indulgence'), G, '0')).toBe(false);
    expect(trigger.when(play('lightning'), G, '0')).toBe(false);
  });

  it('does not fire for basic cards or equipment', () => {
    expect(trigger.when(play('strike'), G, '0')).toBe(false);
    expect(trigger.when(play('peach'), G, '0')).toBe(false);
    expect(trigger.when(play('equip'), G, '0')).toBe(false);
  });

  it('fires on the effectKey, not the card — a 奇袭\'d black basic still counts as 过河拆桥', () => {
    expect(trigger.when(play('dismantle', '0', ['strike_2c']), G, '0')).toBe(true);
  });

  it('only fires for the owner\'s own plays', () => {
    expect(trigger.when(play('dismantle', '1'), G, '0')).toBe(false);
  });

  it('draws exactly one', () => {
    expect(trigger.effect(play('dismantle'), G, '0')).toEqual([{ t: 'draw', player: '0', count: 1 }]);
    expect(trigger.optional).toBe(true);
  });
});
