// 裸衣 (4.3 / Batch B) — draw one fewer, deal +1 with 杀/决斗 this turn.
// Task 4.5.
//
// THE SPLIT PATTERN (skill-trigger-design §11), and the reason this file has
// three describes for one skill: an optional TRIGGER makes the choice and
// writes a turn flag; a LOCKED query (drawCount) and a MANDATORY damage.before
// trigger read it. A fold cannot stop and ask, so "optional query" is not a
// thing (queryTypes.ts's assertQueryProvider enforces this at boot).

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { luoyi } from '../../../src/content/skills/luoyi.js';

const drawTrigger = luoyi.triggers!.find((t) => t.id === 'skill.luoyi.draw')!;
const damageTrigger = luoyi.triggers!.find((t) => t.id === 'skill.luoyi.damage')!;

const flagged = (over: Record<string, unknown> = {}) =>
  makeGState({ turnFlags: { strikesPlayed: 0, strikeLimit: 1, luoyi: true } as never, ...over });

describe('luoyi — the choice half (optional, draw phase)', () => {
  it('offers itself at the start of the owner\'s draw phase only', () => {
    const G = makeGState();
    expect(drawTrigger.when({ event: 'phase.start', phase: 'draw', player: '0' }, G, '0')).toBe(true);
    expect(drawTrigger.when({ event: 'phase.start', phase: 'prep', player: '0' }, G, '0')).toBe(false);
    expect(drawTrigger.when({ event: 'phase.start', phase: 'draw', player: '1' }, G, '0')).toBe(false);
  });

  it('writes the turn flag and nothing else — the flag IS the whole effect', () => {
    expect(drawTrigger.effect({ event: 'phase.start', phase: 'draw', player: '0' }, makeGState(), '0')).toEqual([
      { t: 'flag', key: 'luoyi', value: true },
    ]);
    expect(drawTrigger.optional).toBe(true);
  });
});

describe('luoyi.drawCount — the locked query half', () => {
  it('draws one fewer once the flag is set', () => {
    expect(luoyi.queries!.drawCount!(flagged(), '0', 2)).toBe(1);
  });

  it('draws normally when the choice was declined', () => {
    expect(luoyi.queries!.drawCount!(makeGState(), '0', 2)).toBe(2);
  });

  it('the registry entry is locked:true — that is what lets it answer drawCount at all', () => {
    expect(luoyi.locked).toBe(true);
  });
});

describe('luoyi — the damage half (mandatory: the choice already cost one prompt)', () => {
  const strikeDamage = (over: Record<string, unknown> = {}) => ({
    source: '0',
    target: '1',
    amount: 1,
    kind: 'normal',
    card: 'strike_2c',
    prevented: false,
    seq: 1,
    ...over,
  });

  it('adds +1 to a 杀 the owner is dealing, this turn', () => {
    const G = flagged({ damage: strikeDamage() as never });
    expect(damageTrigger.when({ event: 'damage.before' }, G, '0')).toBe(true);
    expect(damageTrigger.effect({ event: 'damage.before' }, G, '0')).toEqual([
      { t: 'setDamage', patch: { amount: 2 } },
    ]);
  });

  it('is silent without the flag — the bonus is not free', () => {
    const G = makeGState({ damage: strikeDamage() as never });
    expect(damageTrigger.when({ event: 'damage.before' }, G, '0')).toBe(false);
  });

  it('does not boost card-less damage — 南蛮入侵/万箭齐发 get nothing (the reason duel.ts carries `card`)', () => {
    const G = flagged({ damage: strikeDamage({ card: undefined }) as never });
    expect(damageTrigger.when({ event: 'damage.before' }, G, '0')).toBe(false);
  });

  it('does not boost damage from another card type, from another source, or already-prevented damage', () => {
    expect(damageTrigger.when({ event: 'damage.before' }, flagged({ damage: strikeDamage({ card: 'peach_3h' }) as never }), '0')).toBe(false);
    expect(damageTrigger.when({ event: 'damage.before' }, flagged({ damage: strikeDamage({ source: '1' }) as never }), '0')).toBe(false);
    expect(damageTrigger.when({ event: 'damage.before' }, flagged({ damage: strikeDamage({ prevented: true }) as never }), '0')).toBe(false);
  });

  it('is mandatory — the second prompt would be the bug (§11)', () => {
    expect(damageTrigger.optional).toBe(false);
  });
});
