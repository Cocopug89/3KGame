// The engine must never import boardgame.io or call Math.random() directly
// (docs/engine-design.md §7, §8) — it depends on this interface instead. The
// bgio/ adapter (task 2.3) implements it on top of boardgame.io's `random`
// plugin (ctx.random.Shuffle) so shuffles stay seeded, server-side, and
// replayable. Tests (task 2.7) can pass a deterministic fake.
export interface RNG {
  shuffle<T>(items: readonly T[]): T[];
}
