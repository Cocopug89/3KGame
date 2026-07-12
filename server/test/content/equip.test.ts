// equip.ts (task 3.5) — "equipping IS the effect" (engine-design §3): ONE
// CardEffect shared by all 13 equipment effectKeys. The behavior itself lives
// in each weapon/armour's own trigger/query file; this file only moves the
// card from discard (where playCard already put it) into the equip zone.

import { describe, it, expect } from 'vitest';
import { equip } from '../../src/content/effects/equip.js';
import { makeGState } from '../engine/fixtures.js';

describe('equip.targeting / canPlay', () => {
  it('always targets self only — there is no one else to equip', () => {
    expect(equip.targeting).toEqual({ min: 0, max: 0, self: 'only' });
  });

  it('canPlay is always true', () => {
    expect(equip.canPlay(makeGState(), '0')).toBe(true);
  });
});

describe('equip.resolve', () => {
  it('moves the played card from DISCARD (where playCard already put it) into the equip zone', () => {
    const frames = equip.resolve(makeGState(), {
      source: '0',
      cards: ['zhuge_crossbow_ac'],
      targets: [],
    });
    expect(frames).toEqual([
      {
        t: 'moveCards',
        cards: ['zhuge_crossbow_ac'],
        from: { z: 'discard' },
        to: { z: 'equip', player: '0' },
        by: '0',
      },
    ]);
  });

  it('is the same effect for every equipment slot — a horse or armour moves identically', () => {
    const frames = equip.resolve(makeGState(), { source: '1', cards: ['renwang_shield_2c'], targets: [] });
    expect(frames).toEqual([
      {
        t: 'moveCards',
        cards: ['renwang_shield_2c'],
        from: { z: 'discard' },
        to: { z: 'equip', player: '1' },
        by: '1',
      },
    ]);
  });
});
