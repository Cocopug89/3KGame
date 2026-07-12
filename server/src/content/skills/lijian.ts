// 离间 (Diao Chan's Sow Dissent) — once per action phase: discard a card,
// choose two OTHER male characters; one is treated as having used a 决斗 on
// the other.
//
// v1 follows the 2008 rulebook variance (skills.json's own note): this duel
// cannot be answered with 无懈可击. That falls out for free rather than
// needing a flag — the synthesized duel is dispatched by pushing
// `{t:'effect', effectKey:'duel', ...}` DIRECTLY, bypassing pump.ts's
// `'play'` case entirely (there is no physical card being played), and
// nullification wrapping only ever happens inside that case. No `{t:'play'}`
// frame ⇒ no 无懈可击 window, by construction.
//
// targets[0] is treated as the duel's source (they answer first, per
// duel.ts), targets[1] as its target — an arbitrary but documented ordering
// convention, since the skill doesn't otherwise distinguish the two.
//
// ⚠️ Documented simplification: a synthesized duel this way skips the
// `card.play` emission a real 决斗 gets, so a Batch B listener keyed to
// card.play (集智) will not fire for it. Standard has no such interaction for
// this specific combination; flagged for whichever session next reviews
// cross-batch triggers.
//
// ⚠️ (Opus review, 2026-07-12) Two minor consequences of `cards: []` on the
// synthesized duel's ctx, both cosmetic/edge: duel.ts's own `log.plays_at`
// line logs an undefined card id (same class as the documented rainingArrows
// gap), and the duel's damage carries no `card`, so 许褚's 裸衣 ("+1 damage on
// 杀/决斗") won't recognise this specific damage instance if he's a duellist.
// Neither is worth a fix on its own; noted for whoever next touches either.

import type { CardEffect } from '../effectTypes.js';
import type { Skill } from '../skillTypes.js';
import type { GState, PlayerId } from '../../engine/state.js';
import { generals } from '@3k/shared';

const generalGender = new Map(generals.map((g) => [g.id, g.gender]));

const lijianActive: CardEffect = {
  key: 'skill.lijian',

  targeting: {
    min: 2,
    max: 2,
    self: 'forbidden',
    predicate: (G: GState, _self: PlayerId, candidate: PlayerId) =>
      generalGender.get(G.players[candidate]?.generalId ?? '') === 'male',
  },

  canPlay: () => true,

  resolve: (G, rawCtx) => {
    const ctx = rawCtx as { source: PlayerId; targets: PlayerId[]; cards: string[] };
    const [duelSource, duelTarget] = ctx.targets;
    if (!G.players[duelSource]?.alive || !G.players[duelTarget]?.alive) return [];

    return [
      {
        t: 'moveCards' as const,
        cards: ctx.cards,
        from: { z: 'hand' as const, player: ctx.source },
        to: { z: 'discard' as const },
        by: ctx.source,
      },
      {
        t: 'effect' as const,
        effectKey: 'duel',
        ctx: { source: duelSource, targets: [duelTarget], cards: [] },
      },
    ];
  },
};

export const lijian: Skill = {
  id: 'lijian',
  locked: false,
  active: lijianActive,
  activeLimit: 'once_per_turn',
  activeCardCount: 1,
};
