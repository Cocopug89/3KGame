// engine/cardChoice.ts — the slot protocol from
// docs/judgement-nullification-design.md §5, unit-tested away from the cards
// that use it. The invariant with the long shadow (4.4's 大乔/陆逊 will reuse
// this): a hand card is addressed by POSITION, and the position is the
// server's own array order.

import { describe, it, expect } from 'vitest';
import { cardChoicesFor, hasChoosableCards, resolveSlot } from '../../src/engine/cardChoice.js';
import { makeGState, makePlayer } from './fixtures.js';

const G = makeGState({
  players: {
    '0': makePlayer('0'),
    '1': makePlayer('1', {
      hand: ['strike_2c', 'peach_3h', 'dodge_2h1'],
      equipment: {
        weapon: 'zhuge_crossbow_ac',
        armour: 'eight_trigrams_2s',
        plusHorse: null,
        minusHorse: 'red_hare_5h',
      },
      judgementZone: ['indulgence_6h', 'lightning_as'],
    }),
    '2': makePlayer('2'), // nothing at all
  },
  seats: ['0', '1', '2'],
});

describe('cardChoicesFor', () => {
  it('lists hand cards by index and public zones by id', () => {
    expect(cardChoicesFor(G, '1')).toEqual([
      { z: 'hand', index: 0 },
      { z: 'hand', index: 1 },
      { z: 'hand', index: 2 },
      { z: 'equip', cardId: 'zhuge_crossbow_ac' },
      { z: 'equip', cardId: 'eight_trigrams_2s' },
      { z: 'equip', cardId: 'red_hare_5h' },
      { z: 'judgementZone', cardId: 'indulgence_6h' },
      { z: 'judgementZone', cardId: 'lightning_as' },
    ]);
  });

  it('never mentions a hand card id', () => {
    const wire = JSON.stringify(cardChoicesFor(G, '1'));
    for (const id of G.players['1'].hand) {
      expect(wire).not.toContain(id);
    }
  });

  it('is empty for a player with nothing', () => {
    expect(cardChoicesFor(G, '2')).toEqual([]);
    expect(hasChoosableCards(G, '2')).toBe(false);
    expect(hasChoosableCards(G, '1')).toBe(true);
  });
});

describe('resolveSlot', () => {
  it('maps a hand index to the id at that position in the SERVER’s array', () => {
    expect(resolveSlot(G, '1', { z: 'hand', index: 1 })).toEqual({
      cardId: 'peach_3h',
      zone: { z: 'hand', player: '1' },
    });
  });

  it('resolves equipment and judgement-zone cards by id', () => {
    expect(resolveSlot(G, '1', { z: 'equip', cardId: 'red_hare_5h' })).toEqual({
      cardId: 'red_hare_5h',
      zone: { z: 'equip', player: '1' },
    });
    expect(resolveSlot(G, '1', { z: 'judgementZone', cardId: 'lightning_as' })).toEqual({
      cardId: 'lightning_as',
      zone: { z: 'judgementZone', player: '1' },
    });
  });

  it('returns null for anything the target does not actually have', () => {
    expect(resolveSlot(G, '1', { z: 'hand', index: 3 })).toBeNull(); // past the end
    expect(resolveSlot(G, '1', { z: 'hand', index: -1 })).toBeNull();
    expect(resolveSlot(G, '1', { z: 'hand', index: 1.5 })).toBeNull();
    expect(resolveSlot(G, '1', { z: 'equip', cardId: 'frost_blade_2s' })).toBeNull(); // not worn
    expect(resolveSlot(G, '1', { z: 'judgementZone', cardId: 'indulgence_6c' })).toBeNull();
    expect(resolveSlot(G, '2', { z: 'hand', index: 0 })).toBeNull(); // empty player
    expect(resolveSlot(G, 'nobody', { z: 'hand', index: 0 })).toBeNull();
  });

  it('returns null for junk off the wire', () => {
    expect(resolveSlot(G, '1', null as never)).toBeNull();
    expect(resolveSlot(G, '1', { z: 'drawPile', index: 0 } as never)).toBeNull();
    expect(resolveSlot(G, '1', { z: 'hand', cardId: 'peach_3h' } as never)).toBeNull();
  });
});
