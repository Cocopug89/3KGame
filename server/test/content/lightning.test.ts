// 闪电 (task 3.4) — the other DELAYED trick. Three effects: play-time
// self-placement (`lightning`), the judge-time hit/pass split
// (`lightningResult`), and the travel primitive shared by a miss AND a
// nullified judgement (`lightningPass`, judgement-nullification-design §2.4).

import { describe, it, expect } from 'vitest';
import { lightning, lightningResult, lightningPass } from '../../src/content/effects/lightning.js';
import { makeGState, makePlayer } from '../engine/fixtures.js';

describe('lightning.targeting / canPlay / nullify', () => {
  it('self-only, no explicit target selection', () => {
    expect(lightning.targeting).toEqual({ min: 0, max: 0, self: 'only' });
  });

  it('nullify is explicitly "none" — the real window is at judge time (phases.ts)', () => {
    expect(lightning.nullify).toBe('none');
  });

  it('canPlay is false if the player already has one queued', () => {
    const G = makeGState({ players: { '0': makePlayer('0', { judgementZone: ['lightning_as'] }) } });
    expect(lightning.canPlay(G, '0')).toBe(false);
    G.players['0'].judgementZone = [];
    expect(lightning.canPlay(G, '0')).toBe(true);
  });
});

describe('lightning.resolve', () => {
  it('moves the card from discard into the PLAYER\'S OWN judgement zone', () => {
    const frames = lightning.resolve(makeGState(), { source: '0', cards: ['lightning_as'], targets: [] });
    expect(frames).toEqual([
      { t: 'log', key: 'log.plays', params: { player: '0', card: 'lightning_as' } },
      {
        t: 'moveCards',
        cards: ['lightning_as'],
        from: { z: 'discard' },
        to: { z: 'judgementZone', player: '0' },
        by: '0',
      },
    ]);
  });
});

describe('lightningResult (judge-time onResult)', () => {
  it('♠2-9 hits for 3 thunder damage, source is null (no killer), and discards the card', () => {
    const frames = lightningResult.resolve(makeGState(), {
      target: '1',
      judgeCard: 'barbarian_7s', // spades 7
      sourceCard: 'lightning_as',
    });
    expect(frames).toEqual([
      { t: 'log', key: 'log.judgement', params: { player: '1', card: 'barbarian_7s' } },
      // The discard comes BEFORE the damage: 3 thunder damage can kill the
      // holder, and resolveDeath sweeps their judgement zone — a moveCards
      // queued behind the damage would pop against a zone the card already
      // left and throw (lightningDeathRace.test.ts is the repro).
      {
        t: 'moveCards',
        cards: ['lightning_as'],
        from: { z: 'judgementZone', player: '1' },
        to: { z: 'discard' },
      },
      { t: 'damage', source: null, target: '1', amount: 3, kind: 'thunder' },
      { t: 'log', key: 'log.damage', params: { target: '1', n: 3, source: null } },
    ]);
  });

  it('a spades card outside 2-9 (e.g. an ace) misses and passes the card on instead', () => {
    const frames = lightningResult.resolve(makeGState(), {
      target: '1',
      judgeCard: 'duel_as', // spades A — not in HIT_RANKS
      sourceCard: 'lightning_as',
    });
    expect(frames).toEqual([
      { t: 'log', key: 'log.judgement', params: { player: '1', card: 'duel_as' } },
      { t: 'effect', effectKey: 'lightning_pass', ctx: { owner: '1', card: 'lightning_as' } },
    ]);
  });

  it('a non-spade card of a hit rank still misses (suit gate is mandatory)', () => {
    const frames = lightningResult.resolve(makeGState(), {
      target: '1',
      judgeCard: 'strike_7d', // diamonds 7
      sourceCard: 'lightning_as',
    });
    expect(frames).toEqual([
      { t: 'log', key: 'log.judgement', params: { player: '1', card: 'strike_7d' } },
      { t: 'effect', effectKey: 'lightning_pass', ctx: { owner: '1', card: 'lightning_as' } },
    ]);
  });
});

describe('lightningPass', () => {
  function ring(): Parameters<typeof makeGState>[0] {
    return {
      players: { '0': makePlayer('0'), '1': makePlayer('1'), '2': makePlayer('2'), '3': makePlayer('3') },
      seats: ['0', '1', '2', '3'],
    };
  }

  it('travels clockwise to the next LIVING player with no existing 闪电', () => {
    const G = makeGState(ring());
    G.players['1'].judgementZone = ['lightning_as'];
    const frames = lightningPass.resolve(G, { owner: '1', card: 'lightning_as' });
    expect(frames).toEqual([
      {
        t: 'moveCards',
        cards: ['lightning_as'],
        from: { z: 'judgementZone', player: '1' },
        to: { z: 'judgementZone', player: '2' },
      },
    ]);
  });

  it('skips a dead player and one who already holds a 闪电', () => {
    const G = makeGState(ring());
    G.players['1'].judgementZone = ['lightning_as'];
    G.players['2'].alive = false;
    G.players['3'].judgementZone = ['lightning_qh']; // already has one
    const frames = lightningPass.resolve(G, { owner: '1', card: 'lightning_as' });
    expect(frames).toEqual([
      {
        t: 'moveCards',
        cards: ['lightning_as'],
        from: { z: 'judgementZone', player: '1' },
        to: { z: 'judgementZone', player: '0' },
      },
    ]);
  });

  it('nobody eligible (full circle) ⇒ the card stays exactly where it is', () => {
    const G = makeGState(ring());
    G.players['1'].judgementZone = ['lightning_as'];
    G.players['0'].alive = false;
    G.players['2'].alive = false;
    G.players['3'].alive = false;
    expect(lightningPass.resolve(G, { owner: '1', card: 'lightning_as' })).toEqual([]);
  });

  it('no card in ctx (already moved by something else) is a no-op', () => {
    const G = makeGState(ring());
    expect(lightningPass.resolve(G, { owner: '1', card: undefined })).toEqual([]);
  });

  it('is internal — canPlay is always false for lightningResult/lightningPass', () => {
    expect(lightningResult.canPlay(makeGState(), '0')).toBe(false);
    expect(lightningPass.canPlay(makeGState(), '0')).toBe(false);
  });
});
