// What just happened? (task 6.3)
//
// The board never receives events — boardgame.io hands it *snapshots*, and the
// engine's own event log (`G.log`) is still empty (finding F3). So the only
// honest way to animate a state change is to diff the snapshot we're rendering
// against the one we rendered last, and infer what moved.
//
// This is deliberately a pure function over two TableStates: it's the whole of
// the animation's "when", it's the part that's easy to get subtly wrong (a
// player who is dying is not a player who died; a hand that shrank by one may
// have played a card OR discarded it), and a pure diff can be tested exhaustively
// without a renderer, a clock, or a browser.
//
// A note on what this CAN'T see, and why that's fine: two changes to the same
// player between snapshots (damaged twice) collapse into one event with the net
// delta. Standard edition deals damage 1 at a time and every hit opens a
// response window that produces its own snapshot, so in practice each diff
// carries at most one thing per player. When Phase 3's AoE tricks land they
// still resolve one target at a time through the stack — but if a future effect
// ever *does* batch, this degrades to "one flash instead of two", never to a
// wrong flash.

import type { TableState } from './viewTypes.js';

export type TableEventType =
  | 'damage'
  | 'heal'
  | 'dying'
  | 'death'
  | 'played' // a card hit the discard pile
  | 'drew'
  | 'discarded'
  | 'turn';

export interface TableEvent {
  type: TableEventType;
  /** The seat the event happened *to* (or whose turn began). */
  playerId: string;
  /** damage/heal: how much. drew/discarded: how many cards. */
  amount?: number;
  /** played: the card that landed on top of the discard pile. */
  cardId?: string;
}

function handSizeOf(state: TableState, id: string): number {
  const p = state.players[id];
  if (!p) return 0;
  return 'hand' in p ? p.hand.length : p.handCount;
}

/**
 * Events implied by moving from `prev` to `next`. Order matters for the UI:
 * damage before dying before death, so a seat that takes a lethal hit flashes,
 * then reads as dying, then fades — rather than all three at once.
 */
export function diffStates(prev: TableState | null, next: TableState): TableEvent[] {
  if (!prev) return []; // first render: nothing "happened", don't flash the table

  const events: TableEvent[] = [];

  for (const id of next.seats) {
    const before = prev.players[id];
    const after = next.players[id];
    if (!before || !after) continue;

    // HP first — a lethal hit produces damage AND (later) death, and the player
    // needs to see the hit that killed them, not just the corpse.
    if (after.hp < before.hp) {
      events.push({ type: 'damage', playerId: id, amount: before.hp - after.hp });
    } else if (after.hp > before.hp) {
      events.push({ type: 'heal', playerId: id, amount: after.hp - before.hp });
    }

    // Dying is an *open window*, not a state you pass through invisibly: it only
    // counts as new if they weren't already in one.
    const wasDying = before.alive && before.hp <= 0;
    const isDying = after.alive && after.hp <= 0;
    if (isDying && !wasDying) events.push({ type: 'dying', playerId: id });

    if (before.alive && !after.alive) events.push({ type: 'death', playerId: id });

    // Hand movement. A card that left a hand and landed on the discard pile was
    // *played*; the discard-pile check happens once, below, because the pile is
    // shared. Here we only care about the counts, and only for the living —
    // a dead player's hand is discarded wholesale and that's the death animation,
    // not a discard.
    if (after.alive) {
      const delta = handSizeOf(next, id) - handSizeOf(prev, id);
      if (delta > 0) events.push({ type: 'drew', playerId: id, amount: delta });
      else if (delta < 0) events.push({ type: 'discarded', playerId: id, amount: -delta });
    }
  }

  // Whatever is now on top of the discard pile, if it wasn't before, was just
  // played or discarded — either way it's the card the table should look at.
  const topOf = (s: TableState) => (s.discardPile.length ? s.discardPile[s.discardPile.length - 1] : null);
  const nextTop = topOf(next);
  if (nextTop && nextTop !== topOf(prev) && next.discardPile.length > prev.discardPile.length) {
    events.push({ type: 'played', playerId: next.seats[next.activeSeat] ?? '', cardId: nextTop });
  }

  if (prev.activeSeat !== next.activeSeat) {
    const owner = next.seats[next.activeSeat];
    if (owner) events.push({ type: 'turn', playerId: owner });
  }

  return events;
}

/** The class a seat wears while it plays an event back. One event per seat wins:
 * death outranks dying outranks damage — the most consequential thing that
 * happened to that seat is the thing worth showing. */
const SEAT_EVENT_PRIORITY: TableEventType[] = ['death', 'dying', 'damage', 'heal', 'drew', 'discarded'];

export const SEAT_EVENT_CLASS: Partial<Record<TableEventType, string>> = {
  damage: 'fx-damage',
  heal: 'fx-heal',
  dying: 'fx-dying',
  death: 'fx-death',
  drew: 'fx-drew',
  discarded: 'fx-discarded',
};

export function seatEventClasses(events: readonly TableEvent[]): Record<string, string> {
  const byPlayer: Record<string, TableEvent> = {};
  for (const event of events) {
    if (!SEAT_EVENT_CLASS[event.type]) continue;
    const current = byPlayer[event.playerId];
    if (
      !current ||
      SEAT_EVENT_PRIORITY.indexOf(event.type) < SEAT_EVENT_PRIORITY.indexOf(current.type)
    ) {
      byPlayer[event.playerId] = event;
    }
  }
  return Object.fromEntries(
    Object.entries(byPlayer).map(([id, event]) => [id, SEAT_EVENT_CLASS[event.type] as string]),
  );
}

/** How long the board holds an animation class before clearing it. Kept in one
 * place (and in sync with table.css's keyframe durations) so a slow animation
 * can't outlive its class or vice versa. */
export const FX_DURATION_MS = 700;
