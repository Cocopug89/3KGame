// 结姻 (4.4 / Batch C) — once per turn: discard TWO hand cards to heal a
// wounded MALE character 1 (and yourself 1). Task 4.5.
//
// The two-card cost is declared, not hand-rolled: `activeCardCount: 2` is
// checked generically by useSkill (skillTypes.ts's 4.4 addition), the same way
// activeLimit is — a skill must never re-implement a constraint the engine
// already enforces.

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { jieyin } from '../../../src/content/skills/jieyin.js';

const active = jieyin.active!;

const G = makeGState({
  players: {
    '0': makePlayer('0', { generalId: 'sun_shangxiang', hand: ['strike_2c', 'peach_3h'], hp: 2, maxHp: 3 }),
    '1': makePlayer('1', { generalId: 'guan_yu', hp: 2, maxHp: 4 }), // wounded male
    '2': makePlayer('2', { generalId: 'guan_yu', hp: 4, maxHp: 4 }), // full-hp male
    '3': makePlayer('3', { generalId: 'da_qiao', hp: 1, maxHp: 3 }), // wounded female
  },
  seats: ['0', '1', '2', '3'],
});

describe('jieyin.targeting — a WOUNDED MALE character only', () => {
  it('accepts a wounded male', () => {
    expect(active.targeting.predicate!(G, '0', '1')).toBe(true);
  });

  it('rejects a male at full hp — nothing to heal', () => {
    expect(active.targeting.predicate!(G, '0', '2')).toBe(false);
  });

  it('rejects a wounded FEMALE — 结姻 names the gender, and 4.1a put it on the general', () => {
    expect(active.targeting.predicate!(G, '0', '3')).toBe(false);
  });
});

describe('jieyin — the declared cost', () => {
  it('costs exactly two cards, engine-checked', () => {
    expect(jieyin.activeCardCount).toBe(2);
  });

  it('is once per turn', () => {
    expect(jieyin.activeLimit).toBe('once_per_turn');
  });
});
