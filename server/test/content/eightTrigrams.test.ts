// 八卦阵 (task 3.6) — mandatory demand.open: judge, and a red result DEEMS a
// 闪 answered via the new {t:'demandSupply'} primitive (skill-trigger-design
// §12.2). `supplied: []` is a deemed answer, not "no answer" — see
// DemandInfo's own doc comment on why [] and null differ.

import { describe, it, expect } from 'vitest';
import { eightTrigramsTrigger, eightTrigramsResult } from '../../src/content/effects/eightTrigrams.js';
import { makeGState } from '../engine/fixtures.js';
import type { DemandInfo, GState } from '../../src/engine/state.js';

function withDemand(overrides: Partial<DemandInfo> = {}): GState {
  return makeGState({
    demand: { kind: 'dodge', from: '0', by: '1', count: 1, reasonKey: 'demand.dodge', supplied: null, ...overrides },
  });
}

const OPEN_EVENT = { event: 'demand.open' as const, from: '0', kind: 'dodge', count: 1 };

describe('eightTrigramsTrigger', () => {
  it('is mandatory', () => {
    expect(eightTrigramsTrigger.optional).toBe(false);
  });

  it('fires on a dodge demand.open aimed at the owner, still unanswered', () => {
    expect(eightTrigramsTrigger.when(OPEN_EVENT, withDemand(), '0')).toBe(true);
  });

  it('does not fire for a strike demand, a demand aimed at someone else, an already-answered demand, or no demand at all', () => {
    expect(eightTrigramsTrigger.when({ ...OPEN_EVENT, kind: 'strike' }, withDemand(), '0')).toBe(false);
    expect(eightTrigramsTrigger.when(OPEN_EVENT, withDemand(), '1')).toBe(false); // owner isn't being asked
    expect(eightTrigramsTrigger.when(OPEN_EVENT, withDemand({ supplied: [] }), '0')).toBe(false); // already answered
    expect(eightTrigramsTrigger.when(OPEN_EVENT, makeGState(), '0')).toBe(false); // demand: null
  });

  it('pushes a judge with the eight_trigrams onResult', () => {
    expect(eightTrigramsTrigger.effect(OPEN_EVENT, withDemand(), '0')).toEqual([
      { t: 'judge', target: '0', reasonKey: 'judge.eight_trigrams', onResult: 'eight_trigrams_result' },
    ]);
  });
});

describe('eightTrigramsResult (the judge onResult)', () => {
  it('a red (♥/♦) judgement DEEMS the demand answered with an empty (not null) supply', () => {
    const frames = eightTrigramsResult.resolve(withDemand(), { judgeCard: 'strike_6d' }); // diamonds
    expect(frames).toEqual([{ t: 'demandSupply', cards: [] }]);
  });

  it('a black (♠/♣) judgement does nothing — the demand falls through to a real ask', () => {
    const frames = eightTrigramsResult.resolve(withDemand(), { judgeCard: 'strike_2c' }); // clubs
    expect(frames).toEqual([]);
  });

  it('does nothing if there is no judgeCard, or no demand in flight any more', () => {
    expect(eightTrigramsResult.resolve(withDemand(), {})).toEqual([]);
    expect(eightTrigramsResult.resolve(makeGState(), { judgeCard: 'strike_6d' })).toEqual([]);
  });

  it('is internal — canPlay is always false', () => {
    expect(eightTrigramsResult.canPlay(makeGState(), '0')).toBe(false);
  });
});
