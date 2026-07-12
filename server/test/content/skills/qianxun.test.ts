// 谦逊 (4.2 / Batch A) — 过河拆桥 and 乐不思蜀 cannot target 陆逊. Task 4.5.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { qianxun } from '../../../src/content/skills/qianxun.js';

describe('qianxun.targetable — blocks exactly two effectKeys', () => {
  const G = makeGState();

  it('blocks dismantle and indulgence', () => {
    expect(qianxun.queries!.targetable!(G, '0', '1', 'dismantle')).toBe(false);
    expect(qianxun.queries!.targetable!(G, '0', '1', 'indulgence')).toBe(false);
  });

  it('blocks nothing else — 顺手牵羊 IS still allowed to steal from 陆逊', () => {
    expect(qianxun.queries!.targetable!(G, '0', '1', 'steal')).toBe(true);
    expect(qianxun.queries!.targetable!(G, '0', '1', 'strike')).toBe(true);
    expect(qianxun.queries!.targetable!(G, '0', '1', 'duel')).toBe(true);
  });

  it('does not depend on hand size (that is 空城) — it holds unconditionally', () => {
    expect(qianxun.queries!.targetable!(G, '0', '1', 'dismantle')).toBe(false);
  });

  it('is 锁定技', () => {
    expect(qianxun.locked).toBe(true);
  });
});
