// 过河拆桥 (task 3.3). The interesting half of this card is not the discard —
// it's the request: docs/judgement-nullification-design.md §5's rule that the
// attacker points at an opaque SLOT, because a card id leaks suit and rank.
// The "leaks nothing" test below is the one that would catch a regression
// worth catching.

import { describe, it, expect } from 'vitest';
import { dismantle } from '../../src/content/effects/dismantle.js';
import { makeGState, makePlayer } from '../engine/fixtures.js';
import type { GState } from '../../src/engine/state.js';

function victimState(overrides: Partial<GState> = {}): GState {
  return makeGState({
    players: {
      '0': makePlayer('0'),
      '1': makePlayer('1', {
        hand: ['strike_2c', 'peach_3h'],
        equipment: { weapon: 'zhuge_crossbow_ac', armour: null, plusHorse: null, minusHorse: null },
        judgementZone: ['indulgence_6h'],
      }),
    },
    seats: ['0', '1'],
    ...overrides,
  });
}

const ctx = { source: '0', cards: ['dismantle_3c'], targets: ['1'] };

describe('dismantle.resolve — the ask', () => {
  it('asks the SOURCE (not the victim) to choose, and schedules a resume', () => {
    const frames = dismantle.resolve(victimState(), ctx);
    expect(frames).toEqual([
      {
        t: 'request',
        req: {
          kind: 'chooseCard',
          playerId: '0',
          target: '1',
          reasonKey: 'choose.dismantle',
          choices: [
            { z: 'hand', index: 0 },
            { z: 'hand', index: 1 },
            { z: 'equip', cardId: 'zhuge_crossbow_ac' },
            { z: 'judgementZone', cardId: 'indulgence_6h' },
          ],
        },
      },
      { t: 'resume', effectKey: 'dismantle', ctx: { ...ctx, asked: true } },
    ]);
  });

  it('LEAKS NO HAND CARD IDS — hand slots are positions, public zones are named', () => {
    const frames = dismantle.resolve(victimState(), ctx);
    const wire = JSON.stringify(frames[0]);
    // The two hand cards must not appear anywhere in the request…
    expect(wire).not.toContain('strike_2c');
    expect(wire).not.toContain('peach_3h');
    // …while the face-up ones are named, because they're already public.
    expect(wire).toContain('zhuge_crossbow_ac');
    expect(wire).toContain('indulgence_6h');
  });
});

describe('dismantle.resolve — the take', () => {
  it('discards the chosen card from the zone the move resolved it in', () => {
    const frames = dismantle.resolve(victimState(), {
      ...ctx,
      asked: true,
      chosen: 'strike_2c',
      chosenZone: { z: 'hand', player: '1' },
    });
    expect(frames).toEqual([
      {
        t: 'moveCards',
        cards: ['strike_2c'],
        from: { z: 'hand', player: '1' },
        to: { z: 'discard' },
        by: '0',
      },
    ]);
  });

  it('reaches into the judgement zone too (a placed 乐不思蜀 can be dismantled)', () => {
    const frames = dismantle.resolve(victimState(), {
      ...ctx,
      asked: true,
      chosen: 'indulgence_6h',
      chosenZone: { z: 'judgementZone', player: '1' },
    });
    expect(frames).toEqual([
      {
        t: 'moveCards',
        cards: ['indulgence_6h'],
        from: { z: 'judgementZone', player: '1' },
        to: { z: 'discard' },
        by: '0',
      },
    ]);
  });
});

// An arbitrary amount of game happens between the play and the pick — the
// whole 无懈可击 chain, and anything it wakes. Targeting proved the victim was
// alive and held a card THEN, not now.
describe('dismantle.resolve — the window between play and pick', () => {
  it('fizzles if the victim died while the nullification chain argued', () => {
    const G = victimState();
    G.players['1'].alive = false;
    expect(dismantle.resolve(G, ctx)).toEqual([]);
  });

  it('fizzles if the victim lost their last card in the meantime', () => {
    const G = victimState();
    G.players['1'].hand = [];
    G.players['1'].equipment = { weapon: null, armour: null, plusHorse: null, minusHorse: null };
    G.players['1'].judgementZone = [];
    expect(dismantle.resolve(G, ctx)).toEqual([]);
  });
});

describe('dismantle.targeting', () => {
  it('is one other player, at any range, who has something to lose', () => {
    expect(dismantle.targeting.min).toBe(1);
    expect(dismantle.targeting.max).toBe(1);
    expect(dismantle.targeting.self).toBe('forbidden');
    // 过河拆桥 has NO range limit — that's the whole difference from 顺手牵羊.
    expect(dismantle.targeting.inRange).toBeUndefined();

    const G = victimState();
    expect(dismantle.targeting.predicate!(G, '0', '1')).toBe(true);
    G.players['1'].hand = [];
    G.players['1'].equipment = { weapon: null, armour: null, plusHorse: null, minusHorse: null };
    G.players['1'].judgementZone = [];
    expect(dismantle.targeting.predicate!(G, '0', '1')).toBe(false);
  });
});

describe('dismantle.nullify', () => {
  it('is left at the default, so pump wraps it in a 无懈可击 window for free', () => {
    // Not `'once'` explicitly — unset. effectTypes.ts's default for a
    // `type: 'trick'` card IS 'once', and pump.ts reads it there.
    expect(dismantle.nullify).toBeUndefined();
  });
});
