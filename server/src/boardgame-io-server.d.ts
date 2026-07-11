// `boardgame.io` has no "exports" map, so Node's ESM resolver refuses the
// bare `boardgame.io/server` directory import at runtime (ERR_UNSUPPORTED_DIR_IMPORT).
// We import the concrete CJS file instead (see server.ts); this declaration
// re-exposes the same types for that deep import path.
declare module 'boardgame.io/dist/cjs/server.js' {
  export * from 'boardgame.io/server';
}

// Same issue for `boardgame.io/core` (used by the bgio adapter, task 2.3,
// for INVALID_MOVE) — the shallow path resolves fine for `tsc`'s type
// checking (its own package.json has a "types" field) but Node's ESM loader
// refuses the bare directory import at runtime, so the *value* import in
// game.ts uses this deep path instead. This shim gives that deep path the
// same types as the shallow one.
declare module 'boardgame.io/dist/cjs/core.js' {
  export * from 'boardgame.io/core';
}

// And again for `boardgame.io/internal`, whose `createMatch` the room API
// (src/lobby/rooms.ts) uses to build a match exactly the way the framework's
// own POST /games/:name/create route does.
declare module 'boardgame.io/dist/cjs/internal.js' {
  export * from 'boardgame.io/internal';
}
