import type { Game } from 'boardgame.io';

// Minimal counter game to prove server-client sync (Phase 0 smoke test,
// still reachable at ?phase0 — see VERIFY.md). Used to live duplicated in
// client/src/game.ts and server/src/game.ts; this is the fix task 2.2a
// called out (docs/engine-design.md §8, "known blocker").
export interface CounterState {
  count: number;
}

export const CounterGame: Game<CounterState> = {
  setup: (): CounterState => ({
    count: 0,
  }),

  moves: {
    increment: ({ G }: { G: CounterState }) => {
      G.count += 1;
    },
  },
};
