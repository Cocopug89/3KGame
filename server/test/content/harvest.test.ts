// 五谷丰登 (task 3.3b/3.4) — the one `nullify: 'custom'` card. Self-wraps
// exactly ONE window around the reveal (step 1), then walks the pick order
// through the `{z:'revealed'}` chooseCard slot (steps 2+). See harvest.ts's
// own header for the reveal-primitive design call this pins.

import { describe, it, expect } from 'vitest';
import { harvest } from '../../src/content/effects/harvest.js';
import { makeGState, makePlayer } from '../engine/fixtures.js';
import type { GState } from '../../src/engine/state.js';

function table(): GState {
  return makeGState({
    players: { '0': makePlayer('0'), '1': makePlayer('1'), '2': makePlayer('2') },
    seats: ['0', '1', '2'],
  });
}

describe('harvest.targeting / nullify / canPlay', () => {
  it('affects every living player automatically — no target selection at play time', () => {
    expect(harvest.targeting).toEqual({ min: 0, max: 0, self: 'only' });
  });

  it('nullify is "custom" — pump.ts does not auto-wrap it in anything', () => {
    expect(harvest.nullify).toBe('custom');
  });

  it('canPlay is always true', () => {
    expect(harvest.canPlay(table(), '0')).toBe(true);
  });
});

describe('harvest.resolve — step 1: the self-wrapped window around the reveal', () => {
  it('the FIRST call (ctx.revealed unset) wraps its own re-entrant continuation in ONE nullify window', () => {
    const ctx = { source: '0', cards: ['harvest_3h'], targets: [] };
    const frames = harvest.resolve(table(), ctx);
    expect(frames).toEqual([
      { t: 'log', key: 'log.plays', params: { player: '0', card: 'harvest_3h' } },
      {
        t: 'effect',
        effectKey: 'nullify_window',
        ctx: {
          protect: { t: 'effect', effectKey: 'harvest', ctx: { ...ctx, revealed: true } },
          onNullified: undefined,
          parity: 0,
          offset: 0,
          reasonKey: 'nullify.harvest',
        },
      },
    ]);
  });
});

describe('harvest.resolve — step 2: reveal N cards and compute the pick order', () => {
  it('reveals living-player-count cards and starts the pick order at the source, clockwise', () => {
    const ctx = { source: '0', cards: ['harvest_3h'], targets: [], revealed: true };
    const frames = harvest.resolve(table(), ctx);
    expect(frames).toEqual([
      { t: 'reveal', count: 3 },
      { t: 'log', key: 'log.reveals', params: { player: '0', n: 3 } },
      {
        t: 'resume',
        effectKey: 'harvest',
        ctx: { ...ctx, order: ['0', '1', '2'], pickIndex: 0 },
      },
    ]);
  });

  it('skips dead players and starts the order at whoever played it, not seat 0', () => {
    const G = table();
    G.players['1'].alive = false;
    const ctx = { source: '2', cards: ['harvest_3h'], targets: [], revealed: true };
    const frames = harvest.resolve(G, ctx);
    expect(frames).toEqual([
      { t: 'reveal', count: 2 },
      { t: 'log', key: 'log.reveals', params: { player: '2', n: 2 } },
      { t: 'resume', effectKey: 'harvest', ctx: { ...ctx, order: ['2', '0'], pickIndex: 0 } },
    ]);
  });
});

describe('harvest.resolve — step 3: walking the pick order', () => {
  const baseCtx = { source: '0', cards: ['harvest_3h'], targets: [], revealed: true, order: ['0', '1', '2'] };

  it('done (idx past the end) with nothing left over produces nothing', () => {
    const G = table();
    G.revealed = [];
    expect(harvest.resolve(G, { ...baseCtx, pickIndex: 3 })).toEqual([]);
  });

  it('done but leftovers remain ⇒ sweeps them to discard', () => {
    const G = table();
    G.revealed = ['strike_2c', 'strike_3c'];
    expect(harvest.resolve(G, { ...baseCtx, pickIndex: 3 })).toEqual([
      { t: 'moveCards', cards: ['strike_2c', 'strike_3c'], from: { z: 'revealed' }, to: { z: 'discard' } },
    ]);
  });

  it('a dead picker (died mid-argument) is skipped without being asked', () => {
    const G = table();
    G.revealed = ['strike_2c'];
    G.players['1'].alive = false;
    const frames = harvest.resolve(G, { ...baseCtx, pickIndex: 1 });
    expect(frames).toEqual([
      { t: 'effect', effectKey: 'harvest', ctx: { ...baseCtx, pickIndex: 2 } },
    ]);
  });

  it('a live picker not yet asked gets a chooseCard request over the revealed pool', () => {
    const G = table();
    G.revealed = ['strike_2c', 'strike_3c'];
    const frames = harvest.resolve(G, { ...baseCtx, pickIndex: 0 });
    expect(frames).toEqual([
      {
        t: 'request',
        req: {
          kind: 'chooseCard',
          playerId: '0',
          target: '0',
          reasonKey: 'choose.harvest',
          choices: [
            { z: 'revealed', cardId: 'strike_2c' },
            { z: 'revealed', cardId: 'strike_3c' },
          ],
        },
      },
      { t: 'resume', effectKey: 'harvest', ctx: { ...baseCtx, pickIndex: 0, asked: true } },
    ]);
  });

  it('a picker who answered takes the chosen card into hand, logs it, and advances the index', () => {
    const G = table();
    G.revealed = ['strike_2c'];
    const inputCtx = {
      ...baseCtx,
      pickIndex: 0,
      asked: true,
      chosen: 'strike_2c',
      chosenZone: { z: 'revealed' as const },
    };
    const frames = harvest.resolve(G, inputCtx);
    expect(frames).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'revealed' }, to: { z: 'hand', player: '0' }, by: '0' },
      { t: 'log', key: 'log.picks', params: { player: '0', card: 'strike_2c' } },
      // `chosen`/`chosenZone` ride along unchanged — the effect only ever
      // ADDS `asked`/`pickIndex` on top of whatever ctx it was called with,
      // it never strips the previous answer back out.
      { t: 'effect', effectKey: 'harvest', ctx: { ...inputCtx, pickIndex: 1, asked: false } },
    ]);
  });

  it('a picker who answered with nothing chosen just advances (no move, no log)', () => {
    const G = table();
    // The revealed pool must still have cards in it, or idx/leftover-sweep
    // logic (tested above) takes over instead of the "advance" branch this
    // test targets.
    G.revealed = ['strike_2c'];
    const frames = harvest.resolve(G, { ...baseCtx, pickIndex: 0, asked: true });
    expect(frames).toEqual([
      { t: 'effect', effectKey: 'harvest', ctx: { ...baseCtx, pickIndex: 1, asked: false } },
    ]);
  });
});
