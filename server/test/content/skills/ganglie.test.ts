// 刚烈 (4.3 / Batch B) — after damage, judge; on a non-Heart the DAMAGE SOURCE
// picks: discard two hand cards, or take 1 damage from you. Task 4.5.
//
// The four moving parts: the trigger (writes the source into a turn flag,
// because judgeResult's onResult ctx has no room for "who dealt the damage"),
// ganglie_result (reads the judgement), ganglie_choice (the two options), and
// ganglie_discard (the two-card round-trip).

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { ganglie, ganglieResult, ganglieChoice, ganglieDiscard } from '../../../src/content/skills/ganglie.js';

const trigger = ganglie.triggers![0];

const dmg = (over: Record<string, unknown> = {}) =>
  ({ event: 'damage.after', source: '1', target: '0', amount: 1, kind: 'normal', seq: 1, ...over }) as never;

function state(over: Record<string, unknown> = {}) {
  return makeGState({
    players: { '0': makePlayer('0'), '1': makePlayer('1', { hand: ['strike_2c', 'peach_3h'] }) },
    ...over,
  });
}

describe('ganglie — the trigger', () => {
  it('fires for damage to the owner from a living source', () => {
    expect(trigger.when(dmg(), state(), '0')).toBe(true);
  });

  it('does not fire for a source-less hit, a dead source, or damage to someone else', () => {
    expect(trigger.when(dmg({ source: null }), state(), '0')).toBe(false);
    expect(trigger.when(dmg({ target: '1' }), state(), '0')).toBe(false);
    const G = state();
    G.players['1'].alive = false;
    expect(trigger.when(dmg(), G, '0')).toBe(false);
  });

  it('stashes the damage source in a turn flag, then judges', () => {
    expect(trigger.effect(dmg(), state(), '0')).toEqual([
      { t: 'flag', key: 'ganglie.pendingSource', value: '1' },
      { t: 'judge', target: '0', reasonKey: 'judge.ganglie', onResult: 'ganglie_result' },
    ]);
  });
});

describe('ganglie_result — the judgement', () => {
  const flagged = () =>
    state({ turnFlags: { strikesPlayed: 0, strikeLimit: 1, 'ganglie.pendingSource': '1' } });

  it('does nothing on a HEART — 刚烈 fizzles', () => {
    expect(ganglieResult.resolve(flagged(), { target: '0', judgeCard: 'peach_3h' })).toEqual([]);
  });

  it('offers the source the two options on a non-Heart', () => {
    expect(ganglieResult.resolve(flagged(), { target: '0', judgeCard: 'strike_2c' })).toEqual([
      {
        t: 'request',
        req: {
          kind: 'chooseOption',
          playerId: '1',
          reasonKey: 'choose.ganglie',
          options: [
            { id: 'discard_two', labelKey: 'option.ganglie.discard_two' },
            { id: 'take_damage', labelKey: 'option.ganglie.take_damage' },
          ],
        },
      },
      { t: 'resume', effectKey: 'ganglie_choice', ctx: { owner: '0', source: '1' } },
    ]);
  });

  it('fizzles if the source died between the damage and the judgement result', () => {
    const G = flagged();
    G.players['1'].alive = false;
    expect(ganglieResult.resolve(G, { target: '0', judgeCard: 'strike_2c' })).toEqual([]);
  });
});

describe('ganglie_choice — the source pays', () => {
  it('take_damage: 1 point, dealt BY the owner (so it can kill, and credits 夏侯惇)', () => {
    expect(
      ganglieChoice.resolve(state(), { owner: '0', source: '1', chosenOption: 'take_damage' }),
    ).toEqual([{ t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal' }]);
  });

  it('discard_two: asks the SOURCE to pick from their OWN hand, by slot, two rounds', () => {
    const frames = ganglieChoice.resolve(state(), { owner: '0', source: '1', chosenOption: 'discard_two' });
    expect(frames).toEqual([
      {
        t: 'request',
        req: {
          kind: 'chooseCard',
          playerId: '1',
          target: '1',
          reasonKey: 'choose.ganglie_discard',
          choices: [
            { z: 'hand', index: 0 },
            { z: 'hand', index: 1 },
          ],
        },
      },
      { t: 'resume', effectKey: 'ganglie_discard', ctx: { source: '1', remaining: 2 } },
    ]);
  });

  it('an unrecognised option still pays the discard — the cheaper option is never "nothing"', () => {
    const frames = ganglieChoice.resolve(state(), { owner: '0', source: '1', chosenOption: 'nonsense' });
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.some((f) => f.t === 'request')).toBe(true);
  });
});

describe('ganglie_discard — the two-card round-trip', () => {
  it('discards the picked card and asks again for the second', () => {
    const frames = ganglieDiscard.resolve(state(), {
      source: '1',
      remaining: 2,
      chosen: 'strike_2c',
      chosenZone: { z: 'hand', player: '1' },
    });
    expect(frames[0]).toEqual({
      t: 'moveCards',
      cards: ['strike_2c'],
      from: { z: 'hand', player: '1' },
      to: { z: 'discard' },
      by: '1',
    });
    expect(frames[2]).toEqual({ t: 'resume', effectKey: 'ganglie_discard', ctx: { source: '1', remaining: 1 } });
  });

  it('stops once two are paid', () => {
    const frames = ganglieDiscard.resolve(state(), {
      source: '1',
      remaining: 1,
      chosen: 'strike_2c',
      chosenZone: { z: 'hand', player: '1' },
    });
    expect(frames).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'hand', player: '1' }, to: { z: 'discard' }, by: '1' },
    ]);
  });

  it('pays what it can when the source holds fewer than two cards — not an error', () => {
    const G = makeGState({
      players: { '0': makePlayer('0'), '1': makePlayer('1', { hand: [] }) },
    });
    expect(ganglieDiscard.resolve(G, { source: '1', remaining: 2 })).toEqual([]);
  });
});
