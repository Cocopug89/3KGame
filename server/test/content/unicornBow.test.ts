// 麒麟弓 (task 3.6) — optional damage.before, priority 110 (after
// renwangShield's 105): when the owner's 杀 actually deals damage, may
// discard one of the target's horses. Deterministically picks the +1 horse
// first when both are present (documented simplification).

import { describe, it, expect } from 'vitest';
import { unicornBowTrigger } from '../../src/content/effects/unicornBow.js';
import { makeGState, makePlayer } from '../engine/fixtures.js';
import type { DamageInfo, GState } from '../../src/engine/state.js';

function withDamage(
  overrides: Partial<DamageInfo> = {},
  targetOverrides: Parameters<typeof makePlayer>[1] = {},
): GState {
  return makeGState({
    players: { '0': makePlayer('0'), '1': makePlayer('1', targetOverrides) },
    damage: { source: '0', target: '1', amount: 1, kind: 'normal', card: 'strike_2c', seq: 1, ...overrides },
  });
}

describe('unicornBowTrigger', () => {
  it('is optional, priority 110 (after renwangShield\'s 105)', () => {
    expect(unicornBowTrigger.optional).toBe(true);
    expect(unicornBowTrigger.priority).toBe(110);
  });

  it('fires when the owner\'s 杀 deals real damage and the target has a horse', () => {
    const G = withDamage({}, { equipment: { weapon: null, armour: null, plusHorse: 'shadow_5s', minusHorse: null } });
    expect(unicornBowTrigger.when({ event: 'damage.before' }, G, '0')).toBe(true);
  });

  it('does not fire if amount is 0/prevented, the card is not a strike, or the target has no horse', () => {
    expect(
      unicornBowTrigger.when(
        { event: 'damage.before' },
        withDamage({ prevented: true }, { equipment: { weapon: null, armour: null, plusHorse: 'shadow_5s', minusHorse: null } }),
        '0',
      ),
    ).toBe(false);
    expect(
      unicornBowTrigger.when(
        { event: 'damage.before' },
        withDamage({ amount: 0 }, { equipment: { weapon: null, armour: null, plusHorse: 'shadow_5s', minusHorse: null } }),
        '0',
      ),
    ).toBe(false);
    expect(
      unicornBowTrigger.when(
        { event: 'damage.before' },
        withDamage({ card: 'duel_ad' }, { equipment: { weapon: null, armour: null, plusHorse: 'shadow_5s', minusHorse: null } }),
        '0',
      ),
    ).toBe(false);
    expect(unicornBowTrigger.when({ event: 'damage.before' }, withDamage(), '0')).toBe(false); // no horse at all
  });

  it('does not fire for someone else\'s attack', () => {
    const G = withDamage({}, { equipment: { weapon: null, armour: null, plusHorse: 'shadow_5s', minusHorse: null } });
    expect(unicornBowTrigger.when({ event: 'damage.before' }, G, '1')).toBe(false);
  });

  it('discards the +1 horse when both are present (deterministic pick)', () => {
    const G = withDamage(
      {},
      { equipment: { weapon: null, armour: null, plusHorse: 'shadow_5s', minusHorse: 'dilu_5c' } },
    );
    expect(unicornBowTrigger.effect({ event: 'damage.before' }, G, '0')).toEqual([
      { t: 'moveCards', cards: ['shadow_5s'], from: { z: 'equip', player: '1' }, to: { z: 'discard' }, by: '0' },
    ]);
  });

  it('discards the -1 horse when that is all the target has', () => {
    const G = withDamage({}, { equipment: { weapon: null, armour: null, plusHorse: null, minusHorse: 'dilu_5c' } });
    expect(unicornBowTrigger.effect({ event: 'damage.before' }, G, '0')).toEqual([
      { t: 'moveCards', cards: ['dilu_5c'], from: { z: 'equip', player: '1' }, to: { z: 'discard' }, by: '0' },
    ]);
  });
});
