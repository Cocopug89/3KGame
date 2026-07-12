// 青囊 (4.3 / Batch B) — once per turn: discard a hand card, heal a wounded
// player 1. Task 4.5.

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { qingnang } from '../../../src/content/skills/qingnang.js';

const active = qingnang.active!;

function state() {
  return makeGState({
    players: {
      '0': makePlayer('0', { hand: ['strike_2c'], hp: 3, maxHp: 4 }), // wounded 华佗
      '1': makePlayer('1', { hp: 2, maxHp: 4 }), // wounded ally
      '2': makePlayer('2', { hp: 4, maxHp: 4 }), // unhurt
    },
    seats: ['0', '1', '2'],
  });
}

describe('qingnang.targeting — a WOUNDED character, self allowed', () => {
  const G = state();

  it('accepts a wounded other player and a wounded self', () => {
    expect(active.targeting.predicate!(G, '0', '1')).toBe(true);
    expect(active.targeting.predicate!(G, '0', '0')).toBe(true);
    expect(active.targeting.self).toBe('allowed');
  });

  it('rejects a player at full hp — healing them would do nothing', () => {
    expect(active.targeting.predicate!(G, '0', '2')).toBe(false);
  });

  it('takes exactly one target', () => {
    expect(active.targeting.min).toBe(1);
    expect(active.targeting.max).toBe(1);
  });
});

describe('qingnang — the cost and the heal', () => {
  it('discards the card itself (useSkill validates, it does not pay) and heals 1', () => {
    expect(active.resolve(state(), { source: '0', targets: ['1'], cards: ['strike_2c'] })).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'hand', player: '0' }, to: { z: 'discard' }, by: '0' },
      { t: 'heal', target: '1', amount: 1, source: '0', card: 'strike_2c' },
    ]);
  });

  it('refuses a malformed call rather than half-paying it', () => {
    expect(active.resolve(state(), { source: '0', targets: ['1'], cards: [] })).toEqual([]);
    expect(active.resolve(state(), { source: '0', targets: [], cards: ['strike_2c'] })).toEqual([]);
    expect(
      active.resolve(state(), { source: '0', targets: ['1', '2'], cards: ['strike_2c'] }),
    ).toEqual([]);
  });

  it('is once per turn', () => {
    expect(qingnang.activeLimit).toBe('once_per_turn');
  });
});
