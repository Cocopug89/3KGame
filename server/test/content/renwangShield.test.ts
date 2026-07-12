// 仁王盾 (task 3.6) — damage.before PREVENTION, not an un-targetable check: a
// black-suit 杀 dealing damage TO the owner is fully blocked. Priority 105 —
// after blueSteelSword.ts's 100, so an attacker's 青釭剑 ignoreArmour has
// already landed before this reads it.

import { describe, it, expect } from 'vitest';
import { renwangShieldTrigger } from '../../src/content/effects/renwangShield.js';
import { makeGState, makePlayer } from '../engine/fixtures.js';
import type { DamageInfo, GState } from '../../src/engine/state.js';

function withDamage(overrides: Partial<DamageInfo> = {}): GState {
  return makeGState({
    players: { '0': makePlayer('0'), '1': makePlayer('1') },
    damage: { source: '0', target: '1', amount: 1, kind: 'normal', card: 'strike_2c', seq: 1, ...overrides },
  });
}

describe('renwangShieldTrigger', () => {
  it('is mandatory, priority 105 (after blueSteelSword\'s 100)', () => {
    expect(renwangShieldTrigger.optional).toBe(false);
    expect(renwangShieldTrigger.priority).toBe(105);
  });

  it('fires for a black-suit (♠/♣) 杀 dealing damage TO the owner', () => {
    // strike_2c is clubs.
    expect(renwangShieldTrigger.when({ event: 'damage.before' }, withDamage(), '1')).toBe(true);
  });

  it('does not fire for a red-suit 杀', () => {
    expect(renwangShieldTrigger.when({ event: 'damage.before' }, withDamage({ card: 'strike_6d' }), '1')).toBe(false); // diamonds
  });

  it('does not fire for someone else\'s incoming damage, an already-prevented hit, ignoreArmour set, or a non-strike card', () => {
    expect(renwangShieldTrigger.when({ event: 'damage.before' }, withDamage(), '0')).toBe(false); // not the target
    expect(renwangShieldTrigger.when({ event: 'damage.before' }, withDamage({ prevented: true }), '1')).toBe(false);
    expect(renwangShieldTrigger.when({ event: 'damage.before' }, withDamage({ ignoreArmour: true }), '1')).toBe(false); // 青釭剑 already bypassed it
    expect(renwangShieldTrigger.when({ event: 'damage.before' }, withDamage({ card: 'duel_ad' }), '1')).toBe(false);
  });

  it('prevents the damage via setDamage', () => {
    expect(renwangShieldTrigger.effect({ event: 'damage.before' }, withDamage(), '1')).toEqual([
      { t: 'setDamage', patch: { prevented: true } },
    ]);
  });
});
