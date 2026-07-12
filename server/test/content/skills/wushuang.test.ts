// 无双 (4.4 / Batch C) — your 杀 demands two 闪; your 决斗 demands two 杀 per
// round. Task 4.5 (ported and extended from the combined batchC.test.ts).
//
// demandCount(G, owner, kind, current) is called with `owner` = whoever RAISED
// the demand, so this only ever fires when 吕布 himself is demanding.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { wushuang } from '../../../src/content/skills/wushuang.js';

describe('wushuang.demandCount — locked query', () => {
  const G = makeGState();

  it('doubles a dodge demand (his 杀) and a strike demand (his 决斗)', () => {
    expect(wushuang.queries!.demandCount!(G, '0', 'dodge', 1)).toBe(2);
    expect(wushuang.queries!.demandCount!(G, '0', 'strike', 1)).toBe(2);
  });

  it('leaves every other demand alone — a 桃 demand in a dying window stays at one', () => {
    expect(wushuang.queries!.demandCount!(G, '0', 'peach', 1)).toBe(1);
    expect(wushuang.queries!.demandCount!(G, '0', 'nullification', 1)).toBe(1);
  });

  it('is 锁定技 — demandCount is a LOCKED_ONLY_QUERY (queryTypes §4)', () => {
    expect(wushuang.locked).toBe(true);
  });
});
