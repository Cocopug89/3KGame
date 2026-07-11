// The three primitive frames (docs/judgement-nullification-design.md §4) and
// the dead-subject rule. Task 3.2.
//
// These exist so a CardEffect can move a card WITHOUT mutating G — engine-design
// §3's "resolve() returns frames, NEVER mutates G" is what keeps effects from
// reaching into each other's resolution, and Phase 2 only got away without them
// because 杀/闪/桃 never move a card the player didn't play themselves.

import { describe, it, expect } from 'vitest';
import { resolve, pump } from '../../src/engine/pump.js';
import { makeGState, makePlayer, identityRng } from './fixtures.js';

describe("resolve('moveCards') — the universal card mover", () => {
  it('hand → discard (过河拆桥, and the discard half of everything else)', () => {
    const G = makeGState();
    G.players['1'].hand = ['strike_2c', 'peach_3h'];
    resolve(
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'hand', player: '1' }, to: { z: 'discard' } },
      G,
      identityRng,
    );
    expect(G.players['1'].hand).toEqual(['peach_3h']);
    expect(G.discardPile).toEqual(['strike_2c']);
  });

  it("hand → another player's hand (顺手牵羊 — a steal is not a discard)", () => {
    const G = makeGState();
    G.players['1'].hand = ['peach_3h'];
    resolve(
      {
        t: 'moveCards',
        cards: ['peach_3h'],
        from: { z: 'hand', player: '1' },
        to: { z: 'hand', player: '0' },
        by: '0',
      },
      G,
      identityRng,
    );
    expect(G.players['1'].hand).toEqual([]);
    expect(G.players['0'].hand).toEqual(['peach_3h']);
    expect(G.discardPile).toEqual([]);
  });

  it('hand → equip picks the right slot from the card data, and discards what it replaces (3.5)', () => {
    const G = makeGState();
    G.players['0'].hand = ['green_dragon_blade_5s', 'renwang_shield_2c'];
    G.players['0'].equipment.weapon = 'frost_blade_2s'; // already armed

    resolve(
      {
        t: 'moveCards',
        cards: ['green_dragon_blade_5s'],
        from: { z: 'hand', player: '0' },
        to: { z: 'equip', player: '0' },
      },
      G,
      identityRng,
    );
    resolve(
      {
        t: 'moveCards',
        cards: ['renwang_shield_2c'],
        from: { z: 'hand', player: '0' },
        to: { z: 'equip', player: '0' },
      },
      G,
      identityRng,
    );

    expect(G.players['0'].equipment.weapon).toBe('green_dragon_blade_5s');
    expect(G.players['0'].equipment.armour).toBe('renwang_shield_2c'); // right slot, from the data
    expect(G.discardPile).toEqual(['frost_blade_2s']); // the replaced weapon
    expect(G.players['0'].hand).toEqual([]);
  });

  it('hand → judgementZone, and judgementZone → judgementZone (延时锦囊 placement, and 闪电 travelling)', () => {
    const G = makeGState();
    G.players['0'].hand = ['indulgence_6h'];
    resolve(
      {
        t: 'moveCards',
        cards: ['indulgence_6h'],
        from: { z: 'hand', player: '0' },
        to: { z: 'judgementZone', player: '1' },
      },
      G,
      identityRng,
    );
    expect(G.players['1'].judgementZone).toEqual(['indulgence_6h']);

    resolve(
      {
        t: 'moveCards',
        cards: ['indulgence_6h'],
        from: { z: 'judgementZone', player: '1' },
        to: { z: 'judgementZone', player: '0' },
      },
      G,
      identityRng,
    );
    expect(G.players['1'].judgementZone).toEqual([]);
    expect(G.players['0'].judgementZone).toEqual(['indulgence_6h']);
  });

  it("throws rather than silently losing a card the source zone doesn't actually have", () => {
    const G = makeGState();
    expect(() =>
      resolve(
        { t: 'moveCards', cards: ['strike_2c'], from: { z: 'hand', player: '1' }, to: { z: 'discard' } },
        G,
        identityRng,
      ),
    ).toThrow(/does not hold/);
  });
});

describe("resolve('draw') and resolve('skipPhase')", () => {
  it('draw gives a player cards off the top (无中生有, and Phase 5\'s kill-a-rebel reward)', () => {
    const G = makeGState({ drawPile: ['strike_2c', 'peach_3h', 'dodge_2h1'] });
    resolve({ t: 'draw', player: '1', count: 2 }, G, identityRng);
    expect(G.players['1'].hand).toEqual(['strike_2c', 'peach_3h']);
    expect(G.drawPile).toEqual(['dodge_2h1']);
  });

  it('skipPhase writes G.skipPhases, which the phase machine already honours (乐不思蜀)', () => {
    const G = makeGState();
    resolve({ t: 'skipPhase', phase: 'action' }, G, identityRng);
    expect(G.skipPhases).toEqual(['action']);
    resolve({ t: 'skipPhase', phase: 'action' }, G, identityRng); // idempotent
    expect(G.skipPhases).toEqual(['action']);
  });
});

describe('the dead-subject rule (engine-design §5, judgement-nullification-design §4)', () => {
  it.each([
    ['damage', { t: 'damage', source: null, target: '1', amount: 1, kind: 'normal' }],
    ['heal', { t: 'heal', target: '1', amount: 1 }],
    ['judge', { t: 'judge', target: '1', reasonKey: 'r', onResult: 'x' }],
    ['draw', { t: 'draw', player: '1', count: 2 }],
    ['demand', { t: 'demand', kind: 'dodge', from: '1', count: 1, reasonKey: 'r' }],
    ['request', { t: 'request', req: { kind: 'act', playerId: '1' } }],
  ] as const)('drops a %s frame aimed at a dead player, silently and without side effects', (_name, frame) => {
    const G = makeGState({ drawPile: ['strike_2c', 'peach_3h'] });
    G.players['1'].alive = false;
    G.players['1'].hp = 0;

    resolve(frame, G, identityRng);

    expect(G.pending).toBeNull(); // never asks a corpse for anything
    expect(G.stack).toEqual([]);
    expect(G.judgement).toBeNull();
    expect(G.players['1'].hand).toEqual([]);
    expect(G.drawPile).toHaveLength(2); // nothing was flipped or drawn
  });

  it('but an AoE still hits everyone else — a death does not cancel the rest of the stack', () => {
    // engine-design §5's exact promise, now actually testable.
    const G = makeGState({
      players: {
        '0': makePlayer('0'),
        '1': makePlayer('1', { alive: false, hp: 0 }),
        '2': makePlayer('2', { hp: 3 }),
      },
      seats: ['0', '1', '2'],
    });
    G.stack.push(
      { t: 'damage', source: '0', target: '2', amount: 1, kind: 'normal' },
      { t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal' }, // dead — drops
    );
    pump(G, identityRng);

    expect(G.players['2'].hp).toBe(2); // player 3 died; players 4 and 5 still get hit
  });
});
