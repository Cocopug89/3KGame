// 救援 (4.4 / Batch C) — 孙权's lord skill: a 桃 played by a WU ally that saves
// you from dying restores one extra HP. Task 4.5. Locked, lord-only.

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import type { GState } from '../../../src/engine/state.js';
import { jiuyuan } from '../../../src/content/skills/jiuyuan.js';

const trigger = jiuyuan.triggers![0];

function state(overrides: Partial<GState> = {}): GState {
  return makeGState({
    players: {
      '0': makePlayer('0', { generalId: 'sun_quan', role: 'lord', hp: 1, maxHp: 4 }),
      '1': makePlayer('1', { generalId: 'da_qiao' }), // Wu
      '2': makePlayer('2', { generalId: 'guan_yu' }), // Shu
    },
    seats: ['0', '1', '2'],
    ...overrides,
  });
}

const heal = (over: Record<string, unknown> = {}) =>
  ({ event: 'heal.after', target: '0', source: '1', amount: 1, card: 'peach_3h', ...over }) as never;

describe('jiuyuan — a Wu ally\'s 桃 that closed a dying window', () => {
  it('fires for a real peach from a Wu ally while dying (post-heal hp 1, amount 1 ⇒ was at 0)', () => {
    const G = state();
    G.players['0'].hp = 1;
    expect(trigger.when(heal(), G, '0')).toBe(true);
  });

  it('does not fire for a non-Wu healer', () => {
    const G = state();
    G.players['0'].hp = 1;
    expect(trigger.when(heal({ source: '2' }), G, '0')).toBe(false);
  });

  it('does not fire for a card-less heal (a skill heal, e.g. 仁德) — 救援 names the 桃', () => {
    const G = state();
    G.players['0'].hp = 1;
    expect(trigger.when(heal({ card: undefined }), G, '0')).toBe(false);
  });

  it('does not fire when the owner was not actually dying', () => {
    const G = state();
    G.players['0'].hp = 3; // before the heal: 2 — nowhere near the dying window
    expect(trigger.when(heal(), G, '0')).toBe(false);
  });

  it('does not fire for a peach 孙权 played on HIMSELF — "another Wu character"', () => {
    const G = state();
    G.players['0'].hp = 1;
    expect(trigger.when(heal({ source: '0' }), G, '0')).toBe(false);
  });

  it('heals exactly one extra, from no source (it is the skill, not a second 桃)', () => {
    const G = state();
    G.players['0'].hp = 1;
    expect(trigger.effect(heal(), G, '0')).toEqual([{ t: 'heal', target: '0', amount: 1, source: null }]);
  });

  it('is a locked 主公技 — mandatory, and only live while the owner holds the lord role', () => {
    expect(jiuyuan.lordOnly).toBe(true);
    expect(jiuyuan.locked).toBe(true);
    expect(trigger.optional).toBe(false);
  });
});
