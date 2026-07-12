// 雌雄双股剑 (task 3.6) — optional card.target, once per turn: striking a
// character of the OPPOSITE gender lets the target choose which of their own
// cards to give up (self-choice, reusing chooseCard), or the owner draws if
// the target has nothing. Documented simplification: the target is always
// asked to give a card rather than being offered the "owner draws instead"
// branch when they DO have something to give.

import { describe, it, expect } from 'vitest';
import { genderSwordsTrigger, genderSwordsGift } from '../../src/content/effects/genderSwords.js';
import { makeGState, makePlayer } from '../engine/fixtures.js';
import type { GState } from '../../src/engine/state.js';

function table(targetHand: string[] = ['strike_2c']): GState {
  return makeGState({
    players: {
      '0': makePlayer('0', { generalId: 'cao_cao' }), // male
      '1': makePlayer('1', { generalId: 'zhen_ji', hand: targetHand }), // female
      '2': makePlayer('2', { generalId: 'sima_yi' }), // male
    },
  });
}

const TARGET_EVENT = {
  event: 'card.target' as const,
  source: '0',
  target: '1',
  effectKey: 'strike',
  cards: ['strike_2c'],
};

describe('genderSwordsTrigger', () => {
  it('is optional, limited once per turn, priority 100', () => {
    expect(genderSwordsTrigger.optional).toBe(true);
    expect(genderSwordsTrigger.limit).toBe('once_per_turn');
    expect(genderSwordsTrigger.priority).toBe(100);
  });

  it('fires when the owner strikes a character of the opposite gender', () => {
    expect(genderSwordsTrigger.when(TARGET_EVENT, table(), '0')).toBe(true);
  });

  it('does not fire against the same gender, a non-strike card.target, or someone else\'s strike', () => {
    const G = table();
    G.players['1'].generalId = 'sima_yi'; // now both male
    expect(genderSwordsTrigger.when(TARGET_EVENT, G, '0')).toBe(false);

    expect(genderSwordsTrigger.when({ ...TARGET_EVENT, effectKey: 'duel' }, table(), '0')).toBe(false);
    expect(genderSwordsTrigger.when({ ...TARGET_EVENT, source: '2' }, table(), '0')).toBe(false);
  });

  it('asks the TARGET to choose one of their own cards to give up', () => {
    const frames = genderSwordsTrigger.effect(TARGET_EVENT, table(), '0');
    expect(frames).toEqual([
      {
        t: 'request',
        req: {
          kind: 'chooseCard',
          playerId: '1',
          target: '1',
          reasonKey: 'choose.gender_swords',
          choices: [{ z: 'hand', index: 0 }],
        },
      },
      { t: 'resume', effectKey: 'gender_swords_gift', ctx: { owner: '0', target: '1' } },
    ]);
  });

  it('falls back to the owner drawing a card when the target has nothing to give — no request at all', () => {
    const frames = genderSwordsTrigger.effect(TARGET_EVENT, table([]), '0');
    expect(frames).toEqual([{ t: 'draw', player: '0', count: 1 }]);
  });
});

describe('genderSwordsGift (the resume continuation)', () => {
  it('moves the chosen card into the owner\'s hand', () => {
    expect(
      genderSwordsGift.resolve(makeGState(), {
        owner: '0',
        target: '1',
        chosen: 'strike_2c',
        chosenZone: { z: 'hand', player: '1' },
      }),
    ).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'hand', player: '1' }, to: { z: 'hand', player: '0' }, by: '0' },
    ]);
  });

  it('falls back to a draw if nothing was chosen', () => {
    expect(genderSwordsGift.resolve(makeGState(), { owner: '0', target: '1' })).toEqual([
      { t: 'draw', player: '0', count: 1 },
    ]);
  });

  it('is internal — canPlay is always false', () => {
    expect(genderSwordsGift.canPlay(makeGState(), '0')).toBe(false);
  });
});
