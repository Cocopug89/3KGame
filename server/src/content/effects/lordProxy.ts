// Shared body of 护驾 (hujia.ts) and 激将 (jijiang.ts) — both are "other
// characters of my kingdom may, in turn order, answer this demand on my
// behalf," differing only in which kingdom and which demand kind.
//
// This is a `demand.open` listener's effect — it runs INSIDE an already-open
// demand (skill-trigger-design §12.2), so it never opens a second one. It
// asks each eligible ally in turn (seat order starting right after the
// owner), one at a time, via a plain `demandCard` request — the SAME stage
// the demand's own eventual `demandAsk` uses, so `supplyCards` needs no
// changes at all to accept an ally's answer into `G.demand.supplied`.
// Stops at the first ally who supplies; if nobody does (or there are no
// eligible allies), it returns [] and demandAsk asks the owner normally next.

import type { CardEffect } from '../effectTypes.js';
import type { GState, PlayerId } from '../../engine/state.js';
import { generals } from '@3k/shared';

const generalKingdom = new Map(generals.map((g) => [g.id, g.kingdom]));

export interface LordProxyCtx {
  owner: PlayerId;
  order?: PlayerId[];
  index?: number;
}

function alliesInOrder(G: GState, owner: PlayerId, kingdom: string): PlayerId[] {
  const seatOfOwner = G.players[owner]?.seat ?? 0;
  const n = G.seats.length;
  const order: PlayerId[] = [];
  for (let step = 1; step < n; step++) {
    const id = G.seats[(seatOfOwner + step) % n];
    const p = G.players[id];
    if (p?.alive && generalKingdom.get(p.generalId) === kingdom) order.push(id);
  }
  return order;
}

export interface LordProxyOptions {
  /** The effectRegistry key this is registered under — also namespaces the
   * demandCard request's reasonKey. */
  key: string;
  /** The demand kind being proxied ('dodge' for 护驾, 'strike' for 激将). */
  kind: string;
  kingdom: string;
}

export function lordProxyEffect(options: LordProxyOptions): CardEffect {
  return {
    key: options.key,

    targeting: { min: 0, max: 0, self: 'only' },
    canPlay: () => false, // never played directly — only ever pushed by a demand.open listener

    resolve: (G, rawCtx) => {
      const ctx = rawCtx as unknown as LordProxyCtx;
      const owner = ctx.owner;
      if (G.demand && G.demand.supplied !== null) return []; // already answered — stop asking

      const order = ctx.order ?? alliesInOrder(G, owner, options.kingdom);
      const idx = ctx.index ?? 0;
      if (idx >= order.length) return []; // nobody eligible left — demandAsk asks the owner next

      const ally = order[idx];
      return [
        {
          t: 'request',
          req: {
            kind: 'demandCard',
            playerId: ally,
            demandKind: options.kind,
            count: 1,
            // Reuse an existing reasonKey rather than inventing a new locale
            // entry per proxy skill: from the ally's point of view this is
            // exactly the same ask ("supply a dodge" / "supply a strike").
            reasonKey: options.kind === 'dodge' ? 'demand.dodge' : 'demand.strike_duel',
          },
        },
        {
          t: 'resume',
          effectKey: options.key,
          ctx: { owner, order, index: idx + 1 } as unknown as Record<string, unknown>,
        },
      ];
    },
  };
}
