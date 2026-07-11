// Bridges boardgame.io's seeded `random` plugin to the engine's RNG
// interface (docs/engine-design.md §7, §8). The engine never imports
// boardgame.io or calls Math.random() directly — this adapter is the only
// place that's allowed to know boardgame.io exists on the random side.

import type { RNG } from '../engine/rng.js';

/** Minimal structural shape of the bits of boardgame.io's RandomAPI this
 * adapter actually uses. Kept local/structural rather than importing
 * boardgame.io's own `RandomAPI` type — that type lives under an internal
 * path (this package has no "exports" map; see boardgame-io-server.d.ts for
 * the same issue on the server import), and `Game<G>`'s own context typing
 * already gives call sites a correctly-shaped `random` object to pass in. */
export interface BgioRandomLike {
  Shuffle<T>(deck: T[]): T[];
}

export function makeRng(random: BgioRandomLike): RNG {
  return {
    shuffle: (items) => random.Shuffle([...items]),
  };
}
