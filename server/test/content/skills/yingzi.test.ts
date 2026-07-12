// 英姿 (4.2 / Batch A) — draw one extra card. Task 4.5.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { yingzi } from '../../../src/content/skills/yingzi.js';

describe('yingzi.drawCount — +1, chained onto the running count', () => {
  const G = makeGState();

  it('adds one to whatever the fold hands it', () => {
    expect(yingzi.queries!.drawCount!(G, '0', 2)).toBe(3);
    expect(yingzi.queries!.drawCount!(G, '0', 1)).toBe(2);
  });

  it('is 锁定技 — drawCount is a LOCKED_ONLY_QUERY (the 裸衣 half that is NOT the choice)', () => {
    expect(yingzi.locked).toBe(true);
  });
});
