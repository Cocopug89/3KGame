// 贯石斧 (task 3.6) — optional strike.dodged: pay 2 of the OWNER'S OWN cards to
// force the 杀 through for 1 damage anyway. Mirrors frostBlade.ts's shape but
// spends the owner's cards and ends in a fresh {t:'damage'}, not a patch.

import { describe, it, expect } from 'vitest';
import { rockCleavingAxeTrigger, rockCleavingAxeHit, rockCleavingAxeHitFrames } from '../../src/content/effects/rockCleavingAxe.js';
import { makeGState, makePlayer } from '../engine/fixtures.js';
import type { GState } from '../../src/engine/state.js';

function table(ownerHand: string[] = ['strike_3c', 'dodge_2h1']): GState {
  return makeGState({
    players: { '0': makePlayer('0', { hand: ownerHand }), '1': makePlayer('1') },
  });
}

const DODGE_EVENT = { event: 'strike.dodged' as const, source: '0', target: '1', card: 'strike_2c' };

describe('rockCleavingAxeTrigger', () => {
  it('is optional, priority 100', () => {
    expect(rockCleavingAxeTrigger.optional).toBe(true);
    expect(rockCleavingAxeTrigger.priority).toBe(100);
  });

  it('fires only for the owner\'s own dodged strike, and only with ≥2 payable cards', () => {
    expect(rockCleavingAxeTrigger.when(DODGE_EVENT, table(), '0')).toBe(true);
    expect(rockCleavingAxeTrigger.when(DODGE_EVENT, table([]), '0')).toBe(false); // nothing to pay with
    expect(rockCleavingAxeTrigger.when(DODGE_EVENT, table(['strike_3c']), '0')).toBe(false); // only 1
  });

  it('does not fire for someone else\'s dodged strike or an unrelated event', () => {
    expect(rockCleavingAxeTrigger.when({ ...DODGE_EVENT, source: '1' }, table(), '0')).toBe(false);
    expect(rockCleavingAxeTrigger.when({ event: 'strike.hit', source: '0', target: '1', card: 'strike_2c' }, table(), '0')).toBe(
      false,
    );
  });

  it('asks the owner to pay their first of 2 cards', () => {
    const frames = rockCleavingAxeTrigger.effect(DODGE_EVENT, table(), '0');
    expect(frames).toEqual([
      {
        t: 'request',
        req: {
          kind: 'chooseCard',
          playerId: '0',
          target: '0',
          reasonKey: 'choose.rock_cleaving_axe',
          choices: [{ z: 'hand', index: 0 }, { z: 'hand', index: 1 }],
        },
      },
      { t: 'resume', effectKey: 'rock_cleaving_axe_hit', ctx: { owner: '0', target: '1', card: 'strike_2c', remaining: 2 } },
    ]);
  });
});

describe('rockCleavingAxeHitFrames / rockCleavingAxeHit (resume)', () => {
  it('applies a chosen payment and asks again while more is owed and payable', () => {
    const G = table();
    const frames = rockCleavingAxeHitFrames(G, {
      owner: '0',
      target: '1',
      card: 'strike_2c',
      remaining: 2,
      chosen: 'strike_3c',
      chosenZone: { z: 'hand', player: '0' },
    });
    expect(frames).toEqual([
      { t: 'moveCards', cards: ['strike_3c'], from: { z: 'hand', player: '0' }, to: { z: 'discard' }, by: '0' },
      {
        t: 'request',
        req: {
          kind: 'chooseCard',
          playerId: '0',
          target: '0',
          reasonKey: 'choose.rock_cleaving_axe',
          // resolve() never mutates G (engine-design §3) — the moveCards
          // above is only a returned frame, applied later by the pump — so
          // both of the owner's original cards are still live choices here.
          choices: [{ z: 'hand', index: 0 }, { z: 'hand', index: 1 }],
        },
      },
      { t: 'resume', effectKey: 'rock_cleaving_axe_hit', ctx: { owner: '0', target: '1', card: 'strike_2c', remaining: 1 } },
    ]);
  });

  it('once both cards are paid, deals the fresh 1-damage hit instead of asking again', () => {
    const G = table();
    const frames = rockCleavingAxeHit.resolve(G, {
      owner: '0',
      target: '1',
      card: 'strike_2c',
      remaining: 1,
      chosen: 'dodge_2h1',
      chosenZone: { z: 'hand', player: '0' },
    });
    expect(frames).toEqual([
      { t: 'moveCards', cards: ['dodge_2h1'], from: { z: 'hand', player: '0' }, to: { z: 'discard' }, by: '0' },
      { t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal', card: 'strike_2c' },
    ]);
  });

  it('aborts (no hit) if the owner can no longer pay — checked availability may have gone stale mid fan-out', () => {
    const G = makeGState({ players: { '0': makePlayer('0'), '1': makePlayer('1') } }); // empty hand
    expect(rockCleavingAxeHitFrames(G, { owner: '0', target: '1', card: 'strike_2c', remaining: 2 })).toEqual([]);
  });

  it('is internal — canPlay is always false', () => {
    expect(rockCleavingAxeHit.canPlay(makeGState(), '0')).toBe(false);
  });
});
