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

  it('first call announces the target, DEMANDS a 闪, and schedules a resume (4.1b)', () => {
    const frames = strike.resolve(G, { source: '0', cards: ['strike_2c'], targets: ['1'] });
    expect(frames).toEqual([
      // 铁骑/流离/雌雄双股剑 hang off card.target: after the target is locked,
      // before they respond.
      {
        t: 'trigger',
        ev: { event: 'card.target', source: '0', target: '1', effectKey: 'strike', cards: ['strike_2c'] },
      },
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
        ctx: { source: '0', cards: ['strike_2c'], targets: ['1'], demanded: true },
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
