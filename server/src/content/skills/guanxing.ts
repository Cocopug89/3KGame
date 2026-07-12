// 观星 (Zhuge Liang's Stargazing) — at the start of your turn, you may look
// at the top min(living players, 5) cards of the draw pile and put them back
// in any order.
//
// PRIVATE REVEAL, NO NEW MECHANISM (skill-trigger-design §6): the card ids
// ride directly in the `guanxing` PendingRequest's payload, which playerView
// already sends only to `pending.playerId` — the same trick harvest.ts's
// public G.revealed pool uses, except these cards must NOT go anywhere
// public (drawPile is never sent to any client), so they never leave
// G.drawPile at all; they're only ever read here (read-only — resolve() may
// look at G, never mutate it) to build the request.
//
// ⚠️ Documented simplification: the real skill lets Zhuge Liang split the N
// cards between the TOP and the BOTTOM of the draw pile, each independently
// ordered. `{t:'moveCards'}`'s `drawPile` zone only supports re-inserting at
// the top (`unshift` — engine/pump.ts's `putInZone`); there is no primitive
// for "append to the bottom" without a new Zone capability, which is out of
// scope for a content-only lane (skill-trigger-design §9's "if you find
// yourself... adding a rule to a move... stop"). v1 lets the player reorder
// the top N among themselves — always back on top — which is the correct,
// useful subset of the real skill. Flagged for whichever session next
// extends `Zone`/`putInZone` with a bottom-insert option.

import type { Skill } from '../skillTypes.js';

export const guanxing: Skill = {
  id: 'guanxing',
  locked: false,
  triggers: [
    {
      id: 'skill.guanxing',
      event: 'phase.start',
      optional: true,
      labelKey: 'skill.guanxing.name',
      when: (e, G, owner) =>
        e.event === 'phase.start' && e.phase === 'prep' && e.player === owner && G.drawPile.length > 0,
      effect: (_e, G, owner) => {
        const livingCount = G.seats.filter((id) => G.players[id]?.alive).length;
        const n = Math.min(5, livingCount, G.drawPile.length);
        const cards = G.drawPile.slice(0, n);
        return [
          {
            t: 'request',
            req: { kind: 'guanxing', playerId: owner, cards, reasonKey: 'skill.guanxing' },
          },
        ];
      },
    },
  ],
};
