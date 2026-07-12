// 寒冰剑 (task 3.6) — optional damage.before that PREVENTS the hit and instead
// asks the owner to discard up to 2 of the target's cards, one chooseCard
// round-trip at a time. frostBladeDiscardFrames is shared by the trigger's
// first ask and its own resume continuation — this file drives both entry
// points through the same shared builder.

import { describe, it, expect } from 'vitest';
import { frostBladeTrigger, frostBladeDiscard, frostBladeDiscardFrames } from '../../src/content/effects/frostBlade.js';
import { makeGState, makePlayer } from '../engine/fixtures.js';
import type { DamageInfo, GState } from '../../src/engine/state.js';

function withDamage(overrides: Partial<DamageInfo> = {}): GState {
  return makeGState({
    players: {
      '0': makePlayer('0'),
      '1': makePlayer('1', { hand: ['strike_2c', 'dodge_2h1'] }),
    },
    damage: { source: '0', target: '1', amount: 1, kind: 'normal', card: 'strike_2c', seq: 1, ...overrides },
  });
}

describe('frostBladeTrigger', () => {
  it('is optional, priority 100', () => {
    expect(frostBladeTrigger.optional).toBe(true);
    expect(frostBladeTrigger.priority).toBe(100);
  });

  it('fires when the owner\'s 杀 would deal real damage', () => {
    expect(frostBladeTrigger.when({ event: 'damage.before' }, withDamage(), '0')).toBe(true);
  });

  it('does not fire for a non-strike card, someone else\'s attack, or an already-prevented/zero hit', () => {
    expect(frostBladeTrigger.when({ event: 'damage.before' }, withDamage({ card: 'duel_ad' }), '0')).toBe(false);
    expect(frostBladeTrigger.when({ event: 'damage.before' }, withDamage(), '1')).toBe(false);
    expect(frostBladeTrigger.when({ event: 'damage.before' }, withDamage({ prevented: true }), '0')).toBe(false);
    expect(frostBladeTrigger.when({ event: 'damage.before' }, withDamage({ amount: 0 }), '0')).toBe(false);
  });

  it('prevents the damage and immediately asks for the first of up to 2 discards', () => {
    const G = withDamage();
    const frames = frostBladeTrigger.effect({ event: 'damage.before' }, G, '0');
    expect(frames).toEqual([
      { t: 'setDamage', patch: { prevented: true } },
      {
        t: 'request',
        req: {
          kind: 'chooseCard',
          playerId: '0',
          target: '1',
          reasonKey: 'choose.frost_blade',
          choices: [{ z: 'hand', index: 0 }, { z: 'hand', index: 1 }],
        },
      },
      { t: 'resume', effectKey: 'frost_blade_discard', ctx: { owner: '0', target: '1', remaining: 2 } },
    ]);
  });
});

describe('frostBladeDiscardFrames / frostBladeDiscard (the resume continuation)', () => {
  it('applies a chosen card, decrements remaining, and asks again while cards are owed and available', () => {
    const G = withDamage();
    const frames = frostBladeDiscardFrames(G, {
      owner: '0',
      target: '1',
      remaining: 2,
      chosen: 'strike_2c',
      chosenZone: { z: 'hand', player: '1' },
    });
    expect(frames).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'hand', player: '1' }, to: { z: 'discard' }, by: '0' },
      {
        t: 'request',
        req: {
          kind: 'chooseCard',
          playerId: '0',
          target: '1',
          reasonKey: 'choose.frost_blade',
          // resolve()/frostBladeDiscardFrames never mutates G (engine-design
          // §3) — the {t:'moveCards'} above is only a RETURNED frame, applied
          // later by the pump. So choices here are re-derived from G exactly
          // as it stood on entry: both cards still present.
          choices: [{ z: 'hand', index: 0 }, { z: 'hand', index: 1 }],
        },
      },
      { t: 'resume', effectKey: 'frost_blade_discard', ctx: { owner: '0', target: '1', remaining: 1 } },
    ]);
  });

  it('stops once remaining reaches 0 — no third request', () => {
    const G = withDamage();
    const frames = frostBladeDiscard.resolve(G, {
      owner: '0',
      target: '1',
      remaining: 1,
      chosen: 'strike_2c',
      chosenZone: { z: 'hand', player: '1' },
    });
    expect(frames).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'hand', player: '1' }, to: { z: 'discard' }, by: '0' },
    ]);
  });

  it('stops early if the target has nothing left to take, without erroring', () => {
    const G = makeGState({ players: { '0': makePlayer('0'), '1': makePlayer('1') } });
    expect(frostBladeDiscardFrames(G, { owner: '0', target: '1', remaining: 2 })).toEqual([]);
  });

  it('is internal — canPlay is always false', () => {
    expect(frostBladeDiscard.canPlay(makeGState(), '0')).toBe(false);
  });
});
