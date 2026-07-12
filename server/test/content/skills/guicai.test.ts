// 鬼才 (4.4 / Batch C) — replace ANY judgement card with one from your hand.
// Task 4.5.
//
// This is the skill 3.1's retrial hole was designed for: the retrial window is
// a plain {t:'trigger'} fan-out, so 鬼才 is "just a skill" and needed no engine
// change. It asks through its own `guicaiRetrial` request rather than the
// slot protocol — the owner is picking from their OWN hand, which they can see.

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { guicai } from '../../../src/content/skills/guicai.js';

const trigger = guicai.triggers![0];

const held = () =>
  makeGState({ players: { '0': makePlayer('0', { hand: ['strike_2c'] }), '1': makePlayer('1') } });

describe('guicai — judge.card, anyone\'s judgement', () => {
  it('fires for somebody ELSE\'s judgement — 鬼才 is not limited to your own', () => {
    expect(trigger.when({ event: 'judge.card', target: '1', reasonKey: 'judge.x' }, held(), '0')).toBe(true);
  });

  it('fires for the owner\'s own judgement too', () => {
    expect(trigger.when({ event: 'judge.card', target: '0', reasonKey: 'judge.x' }, held(), '0')).toBe(true);
  });

  it('does not fire with an empty hand — there is nothing to swap in', () => {
    expect(trigger.when({ event: 'judge.card', target: '0', reasonKey: 'judge.x' }, makeGState(), '0')).toBe(false);
  });

  it('does not fire on judge.RESULT — the window is before the card takes effect', () => {
    expect(trigger.when({ event: 'judge.result', target: '1', reasonKey: 'judge.x' }, held(), '0')).toBe(false);
  });

  it('asks via guicaiRetrial (own hand — visible to its owner), not the hidden-card slot protocol', () => {
    expect(trigger.effect({ event: 'judge.card', target: '1', reasonKey: 'judge.x' }, held(), '0')).toEqual([
      { t: 'request', req: { kind: 'guicaiRetrial', playerId: '0', reasonKey: 'skill.guicai' } },
    ]);
  });

  it('is optional', () => {
    expect(trigger.optional).toBe(true);
  });
});
