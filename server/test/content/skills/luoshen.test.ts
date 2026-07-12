// 洛神 (4.3 / Batch B) — prep phase: judge; while the result is black you may
// keep the card and judge again. Task 4.5.
//
// The repeat is a SELF-PUSHED LOOP, not a re-trigger (§8): every round re-enters
// through a fresh {t:'judge'} pushed by the previous result's own resolve(), so
// the optional confirmSkill prompt happens exactly once per prep phase.

import { describe, it, expect } from 'vitest';
import { makeGState } from '../../engine/fixtures.js';
import { luoshen, luoshenResult, luoshenChoice } from '../../../src/content/skills/luoshen.js';

const trigger = luoshen.triggers![0];

describe('luoshen — the prep-phase trigger', () => {
  const G = makeGState();

  it('fires at the start of the owner\'s prep phase only', () => {
    expect(trigger.when({ event: 'phase.start', phase: 'prep', player: '0' }, G, '0')).toBe(true);
    expect(trigger.when({ event: 'phase.start', phase: 'draw', player: '0' }, G, '0')).toBe(false);
    expect(trigger.when({ event: 'phase.start', phase: 'prep', player: '1' }, G, '0')).toBe(false);
  });

  it('judges once', () => {
    expect(trigger.effect({ event: 'phase.start', phase: 'prep', player: '0' }, G, '0')).toEqual([
      { t: 'judge', target: '0', reasonKey: 'judge.luoshen', onResult: 'luoshen_result' },
    ]);
  });

  it('is optional, and asks only once — the loop is pushed, not re-triggered', () => {
    expect(trigger.optional).toBe(true);
  });
});

describe('luoshen_result — black keeps going, red stops', () => {
  it('offers keep-and-repeat vs stop on a black judgement', () => {
    expect(luoshenResult.resolve(makeGState(), { target: '0', judgeCard: 'strike_2c' })).toEqual([
      {
        t: 'request',
        req: {
          kind: 'chooseOption',
          playerId: '0',
          reasonKey: 'choose.luoshen',
          options: [
            { id: 'keep_and_repeat', labelKey: 'option.luoshen.keep_and_repeat' },
            { id: 'stop', labelKey: 'option.luoshen.stop' },
          ],
        },
      },
      { t: 'resume', effectKey: 'luoshen_choice', ctx: { owner: '0', judgeCard: 'strike_2c' } },
    ]);
  });

  it('ends the chain on a RED judgement — no prompt at all', () => {
    expect(luoshenResult.resolve(makeGState(), { target: '0', judgeCard: 'peach_3h' })).toEqual([]);
  });
});

describe('luoshen_choice — taking the card and going again', () => {
  it('lifts the judged card back out of the discard pile and re-judges', () => {
    const G = makeGState({ discardPile: ['strike_2c'] });
    expect(
      luoshenChoice.resolve(G, { owner: '0', judgeCard: 'strike_2c', chosenOption: 'keep_and_repeat' }),
    ).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'discard' }, to: { z: 'hand', player: '0' }, by: '0' },
      { t: 'log', key: 'log.picks', params: { player: '0', card: 'strike_2c' } },
      { t: 'judge', target: '0', reasonKey: 'judge.luoshen', onResult: 'luoshen_result' },
    ]);
  });

  it('stops cleanly when the player says stop', () => {
    const G = makeGState({ discardPile: ['strike_2c'] });
    expect(luoshenChoice.resolve(G, { owner: '0', judgeCard: 'strike_2c', chosenOption: 'stop' })).toEqual([]);
  });

  it('does not fabricate a card that has left the discard pile since the judgement', () => {
    const G = makeGState({ discardPile: [] });
    expect(
      luoshenChoice.resolve(G, { owner: '0', judgeCard: 'strike_2c', chosenOption: 'keep_and_repeat' }),
    ).toEqual([]);
  });
});
