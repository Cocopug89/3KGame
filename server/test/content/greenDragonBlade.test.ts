// 青龙偃月刀 (task 3.6) — the §11 裸衣-pattern split for a LOCKED-only query
// (strikeLimit): a mandatory TRIGGER records the grant as a turn flag, and a
// LOCKED query reads it back. Simplification (documented in the file itself):
// the extra strike isn't pinned to the same target who just dodged.

import { describe, it, expect } from 'vitest';
import { greenDragonBladeTrigger, greenDragonBladeQuery } from '../../src/content/effects/greenDragonBlade.js';
import { makeGState } from '../engine/fixtures.js';

const FLAG = 'equip.green_dragon_blade.extraStrikes';

describe('greenDragonBladeTrigger', () => {
  it('is mandatory (锁定技 — the grant is automatic, never prompted)', () => {
    expect(greenDragonBladeTrigger.optional).toBe(false);
  });

  it('fires only on the OWNER\'S OWN strike.dodged, not one they merely witness', () => {
    const G = makeGState();
    expect(
      greenDragonBladeTrigger.when(
        { event: 'strike.dodged', source: '0', target: '1', card: 'strike_2c' },
        G,
        '0',
      ),
    ).toBe(true);
    expect(
      greenDragonBladeTrigger.when(
        { event: 'strike.dodged', source: '1', target: '0', card: 'strike_2c' },
        G,
        '0',
      ),
    ).toBe(false);
  });

  it('does not fire on an unrelated event', () => {
    const G = makeGState();
    expect(greenDragonBladeTrigger.when({ event: 'strike.hit', source: '0', target: '1', card: 'strike_2c' }, G, '0')).toBe(
      false,
    );
  });

  it('writes/increments the extra-strikes turn flag from whatever it currently is', () => {
    const G = makeGState();
    expect(
      greenDragonBladeTrigger.effect(
        { event: 'strike.dodged', source: '0', target: '1', card: 'strike_2c' },
        G,
        '0',
      ),
    ).toEqual([{ t: 'flag', key: FLAG, value: 1 }]);

    G.turnFlags[FLAG] = 1;
    expect(
      greenDragonBladeTrigger.effect(
        { event: 'strike.dodged', source: '0', target: '1', card: 'strike_2c' },
        G,
        '0',
      ),
    ).toEqual([{ t: 'flag', key: FLAG, value: 2 }]);
  });
});

describe('greenDragonBladeQuery.strikeLimit', () => {
  it('adds the turn flag\'s count on top of the running limit', () => {
    const G = makeGState();
    expect(greenDragonBladeQuery.strikeLimit!(G, '0', 1)).toBe(1); // no flag yet
    G.turnFlags[FLAG] = 2;
    expect(greenDragonBladeQuery.strikeLimit!(G, '0', 1)).toBe(3);
  });
});
