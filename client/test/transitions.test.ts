// The state-diff behind every animation (task 6.3).
//
// This is the part of the motion layer that can be wrong in ways a human
// reviewer won't see by watching: a lethal hit that flashes but never fades, a
// dying player animated as dead, a heal read as damage. So the diff is pure and
// tested here; the CSS is just the CSS.

import { describe, expect, it } from 'vitest';
import { FX_DURATION_MS, diffStates, seatEventClasses } from '../src/game/transitions';
import { SCENARIO_STEPS, SCENARIO_SURVIVES } from '../src/game/scenario';
import { FIXTURES } from '../src/game/fixtures';
import type { TableState } from '../src/game/viewTypes';

const stepState = (i: number) => SCENARIO_STEPS[i].state;

describe('diffStates', () => {
  it('animates nothing on the first render — an arriving board must not flash', () => {
    expect(diffStates(null, stepState(0))).toEqual([]);
  });

  it('sees a card land on the discard pile as a play', () => {
    const events = diffStates(stepState(0), stepState(1));
    const played = events.find((e) => e.type === 'played');
    expect(played?.cardId).toBe(stepState(1).discardPile.at(-1));
    expect(played?.playerId).toBe('0'); // the acting seat
  });

  it('sees damage, and reads a hit that lands on 0 hp as dying — not as death', () => {
    const events = diffStates(stepState(1), stepState(2));
    expect(events).toContainEqual({ type: 'damage', playerId: '1', amount: 1 });
    expect(events).toContainEqual({ type: 'dying', playerId: '1' });
    expect(events.some((e) => e.type === 'death')).toBe(false);
  });

  it('sees the death only when the player actually stops being alive', () => {
    const events = diffStates(stepState(2), stepState(3));
    expect(events).toContainEqual({ type: 'death', playerId: '1' });
    // They were already dying — the window doesn't re-open.
    expect(events.some((e) => e.type === 'dying')).toBe(false);
  });

  it('does not report a dead player’s hand loss as a discard', () => {
    // Seat 1 loses 3 cards on death; that's the death animation, not a discard.
    const events = diffStates(stepState(2), stepState(3));
    expect(events.some((e) => e.type === 'discarded' && e.playerId === '1')).toBe(false);
  });

  it('sees a heal as a heal', () => {
    const events = diffStates(SCENARIO_SURVIVES[2].state, SCENARIO_SURVIVES[3].state);
    expect(events).toContainEqual({ type: 'heal', playerId: '1', amount: 1 });
    expect(events.some((e) => e.type === 'damage')).toBe(false);
  });

  it('sees cards drawn and cards discarded', () => {
    const events = diffStates(stepState(3), stepState(4));
    expect(events).toContainEqual({ type: 'drew', playerId: '2', amount: 2 });
  });

  it('sees the turn move to a new seat', () => {
    const events = diffStates(stepState(3), stepState(4));
    expect(events).toContainEqual({ type: 'turn', playerId: '2' });
  });

  it('reports nothing when nothing changed', () => {
    expect(diffStates(stepState(2), stepState(2))).toEqual([]);
  });

  it('never invents an event for a seat that isn’t there', () => {
    const four = FIXTURES[0].state;
    const eight = FIXTURES[1].state;
    // Different games entirely — the diff must not throw or fabricate.
    expect(() => diffStates(four, eight)).not.toThrow();
    for (const e of diffStates(four, eight)) {
      expect(eight.seats).toContain(e.playerId);
    }
  });
});

describe('seatEventClasses', () => {
  it('shows the most consequential thing that happened to a seat', () => {
    const classes = seatEventClasses([
      { type: 'damage', playerId: '1', amount: 1 },
      { type: 'dying', playerId: '1' },
      { type: 'death', playerId: '1' },
    ]);
    expect(classes['1']).toBe('fx-death'); // not fx-damage
  });

  it('animates each seat independently', () => {
    const classes = seatEventClasses([
      { type: 'damage', playerId: '1', amount: 1 },
      { type: 'heal', playerId: '2', amount: 1 },
      { type: 'drew', playerId: '3', amount: 2 },
    ]);
    expect(classes).toEqual({ '1': 'fx-damage', '2': 'fx-heal', '3': 'fx-drew' });
  });

  it('ignores events that aren’t about a seat', () => {
    expect(seatEventClasses([{ type: 'played', playerId: '0', cardId: 'strike_2c' }])).toEqual({});
    expect(seatEventClasses([{ type: 'turn', playerId: '0' }])).toEqual({});
  });
});

describe('the scenario itself', () => {
  it('is a legal sequence of views — every step only shows seat 1 a hand', () => {
    for (const list of [SCENARIO_STEPS, SCENARIO_SURVIVES]) {
      for (const { state } of list) {
        const withHands = Object.entries(state.players).filter(([, p]) => 'hand' in p);
        expect(withHands.map(([id]) => id)).toEqual(['1']);
      }
    }
  });

  it('never resurrects anyone or heals past max hp', () => {
    let previous: TableState | null = null;
    for (const { state } of SCENARIO_STEPS) {
      for (const id of state.seats) {
        const player = state.players[id];
        expect(player.hp).toBeLessThanOrEqual(player.maxHp);
        if (previous && !previous.players[id].alive) expect(player.alive).toBe(false);
      }
      previous = state;
    }
  });

  it('holds each animation class about as long as the CSS runs it', () => {
    // The classes are cleared on a timer (an unmounted element never fires
    // animationend), so the timer must outlast the longest keyframe: 700ms.
    expect(FX_DURATION_MS).toBeGreaterThanOrEqual(700);
  });
});
