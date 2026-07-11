// Task 5.1 — the two HTTP routes the room code needs, hung off the same Koa
// router boardgame.io's lobby API already uses (server.router), so they share
// its port, its CORS config, and its lifecycle.
//
// Two design notes:
//
// • `numPlayers` arrives as a *query* param, not a JSON body. Body parsing in
//   this tree is koa-body, which is boardgame.io's dependency, not ours —
//   importing it here would mean depending on a package we never declared.
//   One integer in a query string isn't worth a new direct dependency.
//
// • The ctx/router types below are structural, not Koa's. Same reason: the
//   Koa types come in transitively via boardgame.io. Structural typing keeps
//   this file honest about the two fields it actually touches, and lets the
//   handlers be unit-tested with a plain object instead of a Koa context.

import { RoomApi, RoomError } from './rooms.js';

export interface RoomRequestCtx {
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  status: number;
  body: unknown;
}

export type RoomRouteHandler = (ctx: RoomRequestCtx) => Promise<void>;

export interface RoomRouterLike {
  get(path: string, handler: RoomRouteHandler): unknown;
  post(path: string, handler: RoomRouteHandler): unknown;
}

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Runs `fn`, writing either its result or a RoomError onto the ctx. Koa's
 * body setter only defaults the status to 200 when the status wasn't set
 * explicitly, so the error path sets status *first*. */
async function respond(ctx: RoomRequestCtx, fn: () => Promise<unknown>): Promise<void> {
  try {
    ctx.body = await fn();
  } catch (err) {
    if (err instanceof RoomError) {
      ctx.status = err.status;
      ctx.body = { error: err.message };
      return;
    }
    throw err;
  }
}

export function registerRoomRoutes(router: RoomRouterLike, api: RoomApi): void {
  /** POST /rooms?numPlayers=6 → { roomCode, matchID, seats, … } */
  router.post('/rooms', async (ctx) => {
    const raw = firstQueryValue(ctx.query.numPlayers);
    const numPlayers = Number.parseInt(raw ?? '', 10);
    await respond(ctx, () => api.createRoom(numPlayers));
  });

  /** GET /rooms/WUXIN → the same summary, for a joiner picking a seat. The
   * client then joins through boardgame.io's own
   * POST /games/:name/:matchID/join with the seat it picked. */
  router.get('/rooms/:code', async (ctx) => {
    await respond(ctx, () => api.describeRoom(ctx.params.code));
  });
}
