// 乐不思蜀 (task 3.4) — a DELAYED trick. Two things this file pins per the
// effect's own header: `nullify: 'none'` is NOT the trick default (the real
// window opens at judge-phase time, not play time), and the card moves via
// {t:'moveCards'} FROM discard (playCard already discarded it before
// resolve() runs), never from hand.

import { describe, it, expect } from 'vitest';
import { indulgence, indulgenceResult, alreadyHasDelayedTrick } from '../../src/content/effects/indulgence.js';
import { makeGState, makePlayer } from '../engine/fixtures.js';

describe('alreadyHasDelayedTrick', () => {
  it('is true when the target already holds a card of that effectKey in their judgement zone', () => {
    const G = makeGState({
      players: { '0': makePlayer('0'), '1': makePlayer('1', { judgementZone: ['indulgence_6h'] }) },
    });
    expect(alreadyHasDelayedTrick(G, '1', 'indulgence')).toBe(true);
    expect(alreadyHasDelayedTrick(G, '1', 'lightning')).toBe(false);
  });

  it('is false for a player with an empty judgement zone, and false for an unknown player', () => {
    const G = makeGState();
    expect(alreadyHasDelayedTrick(G, '1', 'indulgence')).toBe(false);
    expect(alreadyHasDelayedTrick(G, 'ghost', 'indulgence')).toBe(false);
  });
});

describe('indulgence.targeting / nullify', () => {
  it('targets one other living player with no duplicate 乐不思蜀 already queued', () => {
    expect(indulgence.targeting.min).toBe(1);
    expect(indulgence.targeting.max).toBe(1);
    expect(indulgence.targeting.self).toBe('forbidden');
  });

  it('excludes a target who already has one queued, via the predicate', () => {
    const G = makeGState({
      players: { '0': makePlayer('0'), '1': makePlayer('1', { judgementZone: ['indulgence_6h'] }) },
    });
    expect(indulgence.targeting.predicate!(G, '0', '1')).toBe(false);
    G.players['1'].judgementZone = [];
    expect(indulgence.targeting.predicate!(G, '0', '1')).toBe(true);
  });

  it('nullify is explicitly "none" — the play-time window is suppressed on purpose', () => {
    expect(indulgence.nullify).toBe('none');
  });
});

describe('indulgence.resolve', () => {
  it('moves the card from DISCARD into the target\'s judgement zone', () => {
    const frames = indulgence.resolve(makeGState(), {
      source: '0',
      cards: ['indulgence_6h'],
      targets: ['1'],
    });
    expect(frames).toEqual([
      { t: 'log', key: 'log.plays_at', params: { player: '0', card: 'indulgence_6h', target: '1' } },
      {
        t: 'moveCards',
        cards: ['indulgence_6h'],
        from: { z: 'discard' },
        to: { z: 'judgementZone', player: '1' },
        by: '0',
      },
    ]);
  });
});

describe('indulgenceResult (judge-time onResult)', () => {
  it('a non-heart judgement skips the action phase and discards the card', () => {
    const frames = indulgenceResult.resolve(makeGState(), {
      target: '1',
      judgeCard: 'strike_2c', // clubs
      sourceCard: 'indulgence_6h',
    });
    expect(frames).toEqual([
      { t: 'log', key: 'log.judgement', params: { player: '1', card: 'strike_2c' } },
      {
        t: 'moveCards',
        cards: ['indulgence_6h'],
        from: { z: 'judgementZone', player: '1' },
        to: { z: 'discard' },
      },
      { t: 'skipPhase', phase: 'action' },
    ]);
  });

  it('a heart judgement discards the card but does NOT skip the phase', () => {
    const frames = indulgenceResult.resolve(makeGState(), {
      target: '1',
      judgeCard: 'dodge_2h1', // hearts
      sourceCard: 'indulgence_6h',
    });
    expect(frames).toEqual([
      { t: 'log', key: 'log.judgement', params: { player: '1', card: 'dodge_2h1' } },
      {
        t: 'moveCards',
        cards: ['indulgence_6h'],
        from: { z: 'judgementZone', player: '1' },
        to: { z: 'discard' },
      },
    ]);
  });

  it('is internal — canPlay is always false, never played directly', () => {
    expect(indulgenceResult.canPlay(makeGState(), '0')).toBe(false);
  });
});
