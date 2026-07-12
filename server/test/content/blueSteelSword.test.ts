// 青釭剑 (task 3.6) — mandatory damage.before, priority 100 (the equipment
// band's own floor): sets ignoreArmour on the in-flight G.damage before
// anything else in the band (仁王盾 at 105) gets to read it.

import { describe, it, expect } from 'vitest';
import { blueSteelSwordTrigger } from '../../src/content/effects/blueSteelSword.js';
import { PRIORITY_EQUIPMENT } from '../../src/content/triggerTypes.js';
import { makeGState, makePlayer } from '../engine/fixtures.js';
import type { DamageInfo, GState } from '../../src/engine/state.js';

function withDamage(overrides: Partial<DamageInfo> = {}): GState {
  return makeGState({
    players: { '0': makePlayer('0'), '1': makePlayer('1') },
    damage: { source: '0', target: '1', amount: 1, kind: 'normal', card: 'strike_2c', seq: 1, ...overrides },
  });
}

describe('blueSteelSwordTrigger', () => {
  it('is mandatory and pinned to the equipment priority band', () => {
    expect(blueSteelSwordTrigger.optional).toBe(false);
    expect(blueSteelSwordTrigger.priority).toBe(PRIORITY_EQUIPMENT);
  });

  it('fires when the owner\'s own 杀 is dealing damage', () => {
    expect(blueSteelSwordTrigger.when({ event: 'damage.before' }, withDamage(), '0')).toBe(true);
  });

  it('does not fire for someone else\'s strike, a non-strike card, an already-prevented hit, or no damage in flight', () => {
    expect(blueSteelSwordTrigger.when({ event: 'damage.before' }, withDamage(), '1')).toBe(false); // not the source
    expect(blueSteelSwordTrigger.when({ event: 'damage.before' }, withDamage({ card: 'duel_ad' }), '0')).toBe(false);
    expect(blueSteelSwordTrigger.when({ event: 'damage.before' }, withDamage({ prevented: true }), '0')).toBe(false);
    expect(blueSteelSwordTrigger.when({ event: 'damage.before' }, makeGState(), '0')).toBe(false); // damage: null
  });

  it('sets ignoreArmour via setDamage', () => {
    expect(blueSteelSwordTrigger.effect({ event: 'damage.before' }, withDamage(), '0')).toEqual([
      { t: 'setDamage', patch: { ignoreArmour: true } },
    ]);
  });
});
