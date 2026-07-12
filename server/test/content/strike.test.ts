import { describe, it, expect } from 'vitest';
import { strike } from '../../src/content/effects/strike.js';
import { makeGState } from '../engine/fixtures.js';

describe('strike.canPlay', () => {
  it('is true under the strike limit', () => {
    const G = makeGState();
    G.turnFlags = { strikesPlayed: 0, strikeLimit: 1 };
    expect(strike.canPlay(G, '0')).toBe(true);
  });

  it('is false at or over the strike limit', () => {
    const G = makeGState();
    G.turnFlags = { strikesPlayed: 1, strikeLimit: 1 };
    expect(strike.canPlay(G, '0')).toBe(false);
  });

  it('respects a raised limit (诸葛连弩)', () => {
    const G = makeGState();
    G.turnFlags = { strikesPlayed: 3, strikeLimit: Infinity };
    expect(strike.canPlay(G, '0')).toBe(true);
  });
});

describe('strike.resolve', () => {
  const G = makeGState();

  it('first call announces the target and schedules a resume (4.4: card.target now gets its own resume, before the demand is built)', () => {
    const frames = strike.resolve(G, { source: '0', cards: ['strike_2c'], targets: ['1'] });
    expect(frames).toEqual([
      // 铁骑/流离/雌雄双股剑 hang off card.target: after the target is locked,
      // before they respond.
      {
        t: 'trigger',
        ev: { event: 'card.target', source: '0', target: '1', effectKey: 'strike', cards: ['strike_2c'] },
      },
      {
        t: 'resume',
        effectKey: 'strike',
        ctx: { source: '0', cards: ['strike_2c'], targets: ['1'], targeted: true },
      },
    ]);
  });

  it('second call (targeted) builds the demand, no 4.4 skill involved', () => {
    const G2 = makeGState();
    G2.turnFlags = { strikesPlayed: 0, strikeLimit: 1 };
    const frames = strike.resolve(G2, {
      source: '0',
      cards: ['strike_2c'],
      targets: ['1'],
      targeted: true,
    });
    expect(frames).toEqual([
      // NOT a bespoke respondDodge request any more — a generic demand, which
      // is what 龙胆 (answer with a 杀), 无双 (demand two) and 八卦阵 (a judgement
      // deems one) all hook into without strike.ts knowing they exist.
      {
        t: 'demand',
        kind: 'dodge',
        from: '1',
        by: '0',
        count: 1,
        reasonKey: 'demand.dodge',
        subject: '0',
      },
      {
        t: 'resume',
        effectKey: 'strike',
        // `targeted` is dropped once it has done its job of routing here —
        // step 3 never reads it, and keeping it would leave a stale field on
        // every demanded ctx (see strike.ts's comment on this drop).
        ctx: { source: '0', cards: ['strike_2c'], targets: ['1'], demanded: true },
      },
    ]);
  });

  it('铁骑: a forced hit (G.turnFlags["tieji.forceHit"]) skips the demand entirely and clears the flag', () => {
    const G2 = makeGState();
    G2.turnFlags = { strikesPlayed: 0, strikeLimit: 1, 'tieji.forceHit': true };
    const frames = strike.resolve(G2, {
      source: '0',
      cards: ['strike_2c'],
      targets: ['1'],
      targeted: true,
    });
    expect(frames).toEqual([
      { t: 'flag', key: 'tieji.forceHit', value: false },
      { t: 'trigger', ev: { event: 'strike.hit', source: '0', target: '1', card: 'strike_2c' } },
      { t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal', card: 'strike_2c' },
    ]);
  });

  it('流离: a redirect (G.turnFlags["liuli.redirectTo"]) demands from the new target and clears the flag', () => {
    const G2 = makeGState();
    G2.turnFlags = { strikesPlayed: 0, strikeLimit: 1, 'liuli.redirectTo': '2' };
    const frames = strike.resolve(G2, {
      source: '0',
      cards: ['strike_2c'],
      targets: ['1'],
      targeted: true,
    });
    expect(frames).toEqual([
      { t: 'flag', key: 'liuli.redirectTo', value: undefined },
      {
        t: 'demand',
        kind: 'dodge',
        from: '2',
        by: '0',
        count: 1,
        reasonKey: 'demand.dodge',
        subject: '0',
      },
      {
        t: 'resume',
        effectKey: 'strike',
        ctx: { source: '0', cards: ['strike_2c'], targets: ['2'], demanded: true },
      },
    ]);
  });

  it('resuming with a supplied 闪 produces no damage', () => {
    const frames = strike.resolve(G, {
      source: '0',
      cards: ['strike_2c'],
      targets: ['1'],
      demanded: true,
      supplied: ['dodge_2h1'],
    });
    expect(frames).toEqual([
      { t: 'trigger', ev: { event: 'strike.dodged', source: '0', target: '1', card: 'strike_2c' } },
    ]);
  });

  it('a DEEMED 闪 (supplied: [], 八卦阵) is an answer too — empty is not null', () => {
    const frames = strike.resolve(G, {
      source: '0',
      cards: ['strike_2c'],
      targets: ['1'],
      demanded: true,
      supplied: [], // answered, with no card
    });
    expect(frames).toEqual([
      { t: 'trigger', ev: { event: 'strike.dodged', source: '0', target: '1', card: 'strike_2c' } },
    ]);
  });

  it('resuming with no 闪 supplied (null) produces a damage frame', () => {
    const frames = strike.resolve(G, {
      source: '0',
      cards: ['strike_2c'],
      targets: ['1'],
      demanded: true,
      supplied: null,
    });
    expect(frames).toEqual([
      { t: 'trigger', ev: { event: 'strike.hit', source: '0', target: '1', card: 'strike_2c' } },
      { t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal', card: 'strike_2c' },
    ]);
  });
});

describe('strike.targeting', () => {
  it('is exactly one target, not self, within attack range', () => {
    expect(strike.targeting).toEqual({ min: 1, max: 1, self: 'forbidden', inRange: 'attack' });
  });
});
