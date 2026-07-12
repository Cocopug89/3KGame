// 苦肉 (4.3 / Batch B) — lose 1 HP, draw 2. Task 4.5.
//
// Uses {t:'loseHp'} (4.3's engine addition), NOT {t:'damage'} — 失去体力 is not
// 伤害, so 奸雄/反馈/刚烈/遗计 must never see it. That distinction is the whole
// reason the primitive exists, so it is what this file pins hardest.

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { kurou } from '../../../src/content/skills/kurou.js';

const active = kurou.active!;

describe('kurou — lose 1 HP, then draw 2', () => {
  const G = makeGState();

  it('emits loseHp and NOT damage — 苦肉 is not 伤害', () => {
    const frames = active.resolve(G, { source: '0', targets: [], cards: [] });
    expect(frames).toEqual([
      { t: 'loseHp', target: '0', amount: 1 },
      { t: 'draw', player: '0', count: 2 },
    ]);
    expect(frames.some((f) => f.t === 'damage')).toBe(false);
  });

  it('loses first, draws second — the order is what opens the dying window before the draw', () => {
    const frames = active.resolve(G, { source: '0', targets: [], cards: [] });
    expect(frames[0].t).toBe('loseHp');
    expect(frames[1].t).toBe('draw');
  });

  it('is playable at 1 hp — 黄盖 may kill himself with it (the F1 wedge case, fixed in 3.2)', () => {
    const dying = makeGState({ players: { '0': makePlayer('0', { hp: 1 }), '1': makePlayer('1') } });
    expect(active.canPlay(dying, '0')).toBe(true);
    expect(active.resolve(dying, { source: '0', targets: [], cards: [] })[0]).toEqual({
      t: 'loseHp',
      target: '0',
      amount: 1,
    });
  });

  it('is UNLIMITED in the Standard edition — the once-per-phase limit is the 界限突破 reprint', () => {
    expect(kurou.activeLimit).toBeUndefined();
  });
});
