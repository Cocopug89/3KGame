// 遗计 (4.4 / Batch C) — after you take damage, draw two and hand them out
// freely. Task 4.5.
//
// The draw and the distribution cannot happen in one synchronous return (the
// distribution needs the drawn cards' real ids, which do not exist until the
// {t:'draw'} has resolved), so the trigger pushes draw + a hop into
// yiji_distribute, which reads the ids back off the hand.

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { yiji } from '../../../src/content/skills/yiji.js';
import { yijiDistribute } from '../../../src/content/effects/yijiDistribute.js';

const trigger = yiji.triggers![0];

const dmg = (over: Record<string, unknown> = {}) =>
  ({ event: 'damage.after', source: '1', target: '0', amount: 1, kind: 'normal', seq: 1, ...over }) as never;

describe('yiji — the damage.after trigger', () => {
  const G = makeGState();

  it('fires for any damage to the owner, card or no card (unlike 奸雄)', () => {
    expect(trigger.when(dmg(), G, '0')).toBe(true);
    expect(trigger.when(dmg({ card: undefined, source: null }), G, '0')).toBe(true);
  });

  it('does not fire for damage to somebody else', () => {
    expect(trigger.when(dmg({ target: '1' }), G, '0')).toBe(false);
  });

  it('draws two, then hops into the distribution step', () => {
    expect(trigger.effect(dmg(), G, '0')).toEqual([
      { t: 'draw', player: '0', count: 2 },
      { t: 'effect', effectKey: 'yiji_distribute', ctx: { owner: '0' } },
    ]);
  });

  it('is limited per DAMAGE INSTANCE, not per turn — two hits in one turn each get their own 遗计', () => {
    expect(trigger.limit).toBe('once_per_damage');
    expect(trigger.optional).toBe(true);
  });
});

describe('yiji_distribute — reads back the two cards the draw just gave', () => {
  it('asks with exactly the last two hand cards', () => {
    const G = makeGState({
      players: { '0': makePlayer('0', { hand: ['peach_3h', 'strike_2c', 'dodge_2h1'] }) },
    });
    expect(yijiDistribute.resolve(G, { owner: '0' })).toEqual([
      {
        t: 'request',
        req: { kind: 'yijiDistribute', playerId: '0', cards: ['strike_2c', 'dodge_2h1'], reasonKey: 'skill.yiji' },
      },
    ]);
  });

  it('is a no-op when the draw came up empty (deck exhausted)', () => {
    const G = makeGState({ players: { '0': makePlayer('0', { hand: [] }) } });
    expect(yijiDistribute.resolve(G, { owner: '0' })).toEqual([]);
  });
});
