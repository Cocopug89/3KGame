// Node ESM can't do a bare directory import of `boardgame.io/server` (the
// package has no "exports" map), so we import the CJS build directly.
import { Server, Origins } from 'boardgame.io/dist/cjs/server.js';
import { CounterGame } from '@3k/shared';
import { ThreeKingdomsGame } from './bgio/game.js';
import { RoomRegistry } from './lobby/roomCodes.js';
import { RoomApi } from './lobby/rooms.js';
import { registerRoomRoutes } from './lobby/routes.js';

const port = process.env.PORT || 3000;

// Allowed origins for browsers to connect from. Always allow localhost in
// dev; in production, set CLIENT_ORIGIN to the deployed Netlify URL
// (e.g. https://three-kingdoms-kill-abc123.netlify.app).
const origins: (string | RegExp)[] = [];
if (Origins.LOCALHOST_IN_DEVELOPMENT instanceof RegExp) {
  origins.push(Origins.LOCALHOST_IN_DEVELOPMENT);
}
if (process.env.CLIENT_ORIGIN) {
  origins.push(process.env.CLIENT_ORIGIN);
}

const server = Server({
  // CounterGame stays registered — it's the Phase 0 smoke test, still
  // reachable at ?phase0 (see VERIFY.md). ThreeKingdomsGame is the real
  // game; the client connects to it through the lobby (task 5.1) and renders
  // a read-only table until the board UI lands in Phase 6.
  games: [CounterGame, ThreeKingdomsGame],
  origins,
});

// ── Rooms / join-by-code (task 5.1) ─────────────────────────────────────
// Two extra routes on boardgame.io's own lobby router (so they share its
// port and CORS): POST /rooms?numPlayers=N and GET /rooms/:code. Joining,
// leaving and credentials stay on the framework's endpoints — see
// src/lobby/rooms.ts. Must be registered before run(), which is what mounts
// the router onto the Koa app.
const rooms = new RoomRegistry();
registerRoomRoutes(
  server.router,
  new RoomApi({ db: server.db, game: ThreeKingdomsGame, rooms }),
);

// An abandoned room holds its code forever otherwise. Nothing depends on the
// exact numbers — a room nobody has finished in 12h is dead, and the codes
// need to become re-usable eventually.
const ROOM_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const ROOM_PRUNE_INTERVAL_MS = 60 * 60 * 1000;
setInterval(() => {
  const pruned = rooms.prune(ROOM_MAX_AGE_MS);
  if (pruned.length > 0) {
    console.log(`🧹 Pruned ${pruned.length} stale room(s): ${pruned.map((r) => r.code).join(', ')}`);
  }
}, ROOM_PRUNE_INTERVAL_MS).unref();

server.run(port as number, () => {
  console.log(`🎮 Three Kingdoms Kill Server running on port ${port}`);
  console.log(`📡 WebSocket server ready for clients`);
  console.log(`🚪 Lobby ready — POST /rooms?numPlayers=N · GET /rooms/:code`);
  if (origins.length === 0) {
    console.warn('⚠️  No allowed origins configured — browsers will be blocked. Set CLIENT_ORIGIN.');
  }
});
