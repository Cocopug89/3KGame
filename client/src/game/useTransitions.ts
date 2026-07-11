// Holds the previous snapshot, diffs it against the current one, and hands the
// board a set of short-lived CSS classes (task 6.3).
//
// The hook exists so the components stay declarative: they don't know an
// animation is playing, they just render whatever class they're given. All the
// "when" is in transitions.ts (pure, tested) and all the "how" is in table.css.
//
// The class is cleared on a timer rather than on `animationend`: an element that
// is unmounted mid-animation (a seat that dies, a card that leaves the hand)
// never fires that event, and a stuck class would freeze a seat mid-shake.

import { useEffect, useRef, useState } from 'react';
import { FX_DURATION_MS, diffStates, seatEventClasses, type TableEvent } from './transitions.js';
import type { TableState } from './viewTypes.js';

export interface Transitions {
  /** playerId → the fx-* class that seat is currently playing. */
  seatClasses: Record<string, string>;
  /** The card that just hit the discard pile, animated in the centre. */
  playedCardId: string | null;
  events: readonly TableEvent[];
}

const NONE: Transitions = { seatClasses: {}, playedCardId: null, events: [] };

export function useTransitions(state: TableState): Transitions {
  const previous = useRef<TableState | null>(null);
  const [transitions, setTransitions] = useState<Transitions>(NONE);

  useEffect(() => {
    const events = diffStates(previous.current, state);
    previous.current = state;
    if (events.length === 0) return;

    setTransitions({
      seatClasses: seatEventClasses(events),
      playedCardId: events.find((e) => e.type === 'played')?.cardId ?? null,
      events,
    });

    const timer = setTimeout(() => setTransitions(NONE), FX_DURATION_MS);
    return () => clearTimeout(timer);
  }, [state]);

  return transitions;
}
