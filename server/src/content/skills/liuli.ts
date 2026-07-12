// 流离 (Da Qiao's Wandering) — when you are targeted by a 杀, you may discard
// a card to transfer it to another character within YOUR attack range (not
// the 杀's user).
//
// Same `card.target` hook and the same G.turnFlags handoff as 铁骑
// (tieji.ts) — see content/effects/strike.ts's header for the full ordering
// argument for why this can't reach strike.ts's resume ctx directly. This
// trigger owns the "discard a card + name a new target" request itself (a
// new `liuliRedirect` kind — the redirect target is visible only to the
// player being asked, so it belongs in a PendingRequest payload, not a
// public one); the bgio move (server/src/bgio/game.ts) does the discard and
// writes `liuli.redirectTo`.
//
// ⚠️ Documented simplification: Standard rules let the NEW target chain
// another 流离 (or 铁骑) of their own. This implementation redirects at most
// once per 杀 — content/effects/strike.ts's `card.target` trigger only fires
// for the ORIGINAL target, not the redirected one. Flagged for a future
// session; re-emitting `card.target` for the new target would need
// strike.ts's step 2 to re-enter step 1 instead of building the demand,
// which is a bigger restructure than this lane's scope.
//
// ⚠️ (Opus review, 2026-07-12) If 铁骑 (owned by the strike's SOURCE) and 流离
// (owned by the ORIGINAL target) are both eligible on the same strike, both
// turnFlags get set in the same card.target fan-out and strike.ts's step 2
// applies BOTH: the strike becomes unblockable AND lands on the redirected
// target. Whether a forced hit should survive a redirect is a genuinely
// ambiguous rules corner (no Standard general has both skills at once, so it
// never actually collides); this is the defensible reading but is
// undocumented rules judgment, not a verified ruling.

import type { Skill } from '../skillTypes.js';
import { inAttackRange } from '../../engine/distance.js';

export const liuli: Skill = {
  id: 'liuli',
  locked: false,
  triggers: [
    {
      id: 'skill.liuli',
      event: 'card.target',
      optional: true,
      labelKey: 'skill.liuli.name',
      when: (e, G, owner) => {
        if (e.event !== 'card.target' || e.effectKey !== 'strike') return false;
        if (e.target !== owner || e.source === owner) return false;
        if ((G.players[owner]?.hand.length ?? 0) === 0) return false;
        return G.seats.some(
          (id) =>
            id !== owner &&
            id !== e.source &&
            G.players[id]?.alive &&
            inAttackRange(G, owner, id),
        );
      },
      effect: (e, G, owner) => {
        if (e.event !== 'card.target') return [];
        const candidates = G.seats.filter(
          (id) =>
            id !== owner &&
            id !== e.source &&
            G.players[id]?.alive &&
            inAttackRange(G, owner, id),
        );
        return [
          {
            t: 'request',
            req: { kind: 'liuliRedirect', playerId: owner, candidates, reasonKey: 'skill.liuli' },
          },
        ];
      },
    },
  ],
};
