// 奇才 (4.2 / Batch A) — tricks ignore the distance limit. Task 4.5.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { qicai } from '../../../src/content/skills/qicai.js';

describe('qicai.ignoresDistance — every trick, nothing else', () => {
  const G = makeGState();

  it('ignores distance for the range-limited tricks', () => {
    for (const key of ['dismantle', 'steal', 'duel', 'duress', 'indulgence']) {
      expect(qicai.queries!.ignoresDistance!(G, '0', key)).toBe(true);
    }
  });

  it('does NOT ignore distance for 杀 — that is 诸葛连弩/马术 territory, not 奇才', () => {
    expect(qicai.queries!.ignoresDistance!(G, '0', 'strike')).toBe(false);
    expect(qicai.queries!.ignoresDistance!(G, '0', 'dodge')).toBe(false);
    expect(qicai.queries!.ignoresDistance!(G, '0', 'peach')).toBe(false);
  });

  it('is 锁定技', () => {
    expect(qicai.locked).toBe(true);
  });
});
