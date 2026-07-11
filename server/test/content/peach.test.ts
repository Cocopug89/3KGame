import { describe, it, expect } from 'vitest';
import { peach } from '../../src/content/effects/peach.js';
import { makeGState } from '../engine/fixtures.js';

describe('peach.canPlay', () => {
  it('is true when hurt', () => {
    const G = makeGState();
    G.players['0'].maxHp = 4;
    G.players['0'].hp = 3;
    expect(peach.canPlay(G, '0')).toBe(true);
  });

  it('is false at full HP', () => {
    const G = makeGState();
    G.players['0'].maxHp = 4;
    G.players['0'].hp = 4;
    expect(peach.canPlay(G, '0')).toBe(false);
  });
});

describe('peach.resolve', () => {
  it('heals the player who played it by 1', () => {
    const G = makeGState();
    const frames = peach.resolve(G, { source: '0', cards: ['peach_3h'], targets: [] });
    // `source` is threaded onto the heal so heal.after can name who healed —
    // 救援 (the lord skill) listens for exactly that (4.1b).
    expect(frames).toEqual([
      { t: 'heal', target: '0', amount: 1, source: '0', card: 'peach_3h' },
    ]);
  });
});

describe('peach.targeting', () => {
  it('targets only self, with no explicit target selection', () => {
    expect(peach.targeting).toEqual({ min: 0, max: 0, self: 'only' });
  });
});
