// 铁骑 (4.4 / Batch C) — after you name a target with a 杀, judge: on red, that
// 杀 cannot be dodged. Task 4.5.
//
// The judge is ordinary. The interesting part is the CHANNEL: the result cannot
// reach strike.ts through applyToResumeFrame (strike's resume frame is not on
// top when this fires), so tieji_result writes G.turnFlags['tieji.forceHit'] and
// strike.ts's step-3 reads and clears it. Both halves are pinned here.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { tieji } from '../../../src/content/skills/tieji.js';
import { tiejiResult } from '../../../src/content/effects/tiejiResult.js';

const trigger = tieji.triggers![0];

const target = (over: Record<string, unknown> = {}) =>
  ({ event: 'card.target', source: '0', target: '1', effectKey: 'strike', cards: ['strike_2c'], ...over }) as never;

describe('tieji — card.target on the owner\'s OWN 杀', () => {
  const G = makeGState({ drawPile: ['strike_2c'] });

  it('fires when the owner is the source of a strike that just named a target', () => {
    expect(trigger.when(target(), G, '0')).toBe(true);
  });

  it('does not fire for someone else\'s strike', () => {
    expect(trigger.when(target({ source: '1' }), G, '0')).toBe(false);
  });

  it('does not fire for a 决斗 or any other card', () => {
    expect(trigger.when(target({ effectKey: 'duel' }), G, '0')).toBe(false);
    expect(trigger.when(target({ effectKey: 'dismantle' }), G, '0')).toBe(false);
  });

  it('does not fire with an empty draw pile — there is nothing to judge with', () => {
    expect(trigger.when(target(), makeGState({ drawPile: [] }), '0')).toBe(false);
  });

  it('judges, with tieji_result as the continuation', () => {
    expect(trigger.effect(target(), G, '0')).toEqual([
      { t: 'judge', target: '0', reasonKey: 'judge.tieji', onResult: 'tieji_result' },
    ]);
  });

  it('is optional', () => {
    expect(trigger.optional).toBe(true);
  });
});

describe('tieji_result — the turnFlags handoff into strike.ts', () => {
  it('sets the force-hit flag on a RED judgement', () => {
    expect(tiejiResult.resolve(makeGState(), { judgeCard: 'strike_jh' })).toEqual([
      { t: 'flag', key: 'tieji.forceHit', value: true },
    ]);
  });

  it('does nothing on a BLACK judgement — the 杀 can still be dodged', () => {
    expect(tiejiResult.resolve(makeGState(), { judgeCard: 'strike_2c' })).toEqual([]);
  });

  it('writes a flag, never a frame that reaches into the strike — the ordering argument in strike.ts\'s header', () => {
    const frames = tiejiResult.resolve(makeGState(), { judgeCard: 'strike_jh' });
    expect(frames.every((f) => f.t === 'flag')).toBe(true);
  });
});
