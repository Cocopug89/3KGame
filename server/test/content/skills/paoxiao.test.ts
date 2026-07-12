// 咆哮 (4.2 / Batch A) — no strike limit. Task 4.5.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { paoxiao } from '../../../src/content/skills/paoxiao.js';

describe('paoxiao.strikeLimit — unlimited 杀', () => {
  const G = makeGState();

  it('returns Infinity regardless of the running limit it is chained onto', () => {
    expect(paoxiao.queries!.strikeLimit!(G, '0', 1)).toBe(Infinity);
    expect(paoxiao.queries!.strikeLimit!(G, '0', 5)).toBe(Infinity);
  });

  it('is 锁定技 — strikeLimit is a LOCKED_ONLY_QUERY, a fold cannot stop and ask (queryTypes §4)', () => {
    expect(paoxiao.locked).toBe(true);
  });
});
