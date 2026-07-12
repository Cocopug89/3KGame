// 马术 (4.2 / Batch A) — distance FROM 马超 is −1. Task 4.5.
//
// distanceModifier(G, from, to, owner) takes both ends of the measurement AND
// the owner, because the fold sums over every living player's providers
// (queryTypes.ts) — 马术 is the "owner is the measurer" case.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { mashu } from '../../../src/content/skills/mashu.js';

describe('mashu.distanceModifier — −1 only when the owner is measuring', () => {
  const G = makeGState();

  it('shortens the distance from the owner to anyone', () => {
    expect(mashu.queries!.distanceModifier!(G, '0', '1', '0')).toBe(-1);
  });

  it('does not shorten the distance TO the owner — 马术 is one-directional', () => {
    expect(mashu.queries!.distanceModifier!(G, '1', '0', '0')).toBe(0);
  });

  it('contributes nothing to a measurement the owner is not an endpoint of', () => {
    expect(mashu.queries!.distanceModifier!(G, '1', '2', '0')).toBe(0);
  });

  it('is 锁定技', () => {
    expect(mashu.locked).toBe(true);
  });
});
