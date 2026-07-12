// 结姻 (Sun Shangxiang's Marriage) — once per action phase: discard two hand
// cards, choose a wounded MALE character; you and they each recover 1 hp.
//
// The exact discard-2 cost is enforced generically by `activeCardCount` (4.4
// addition to skillTypes.ts/bgio's useSkill move) rather than a skill-shaped
// `if` inside the move.

import type { CardEffect } from '../effectTypes.js';
import type { Skill } from '../skillTypes.js';
import type { GState, PlayerId } from '../../engine/state.js';
import { generals } from '@3k/shared';

const generalGender = new Map(generals.map((g) => [g.id, g.gender]));

const jieyinActive: CardEffect = {
  key: 'skill.jieyin',

  targeting: {
    min: 1,
    max: 1,
    self: 'forbidden',
    predicate: (G: GState, _self: PlayerId, candidate: PlayerId) => {
      const p = G.players[candidate];
      if (!p) return false;
      return generalGender.get(p.generalId) === 'male' && p.hp < p.maxHp;
    },
  },

  canPlay: () => true,

  resolve: (G, rawCtx) => {
    const ctx = rawCtx as { source: PlayerId; targets: PlayerId[]; cards: string[] };
    const source = ctx.source;
    const target = ctx.targets[0];
    if (!G.players[target]?.alive) return [];

    return [
      {
        t: 'moveCards' as const,
        cards: ctx.cards,
        from: { z: 'hand' as const, player: source },
        to: { z: 'discard' as const },
        by: source,
      },
      { t: 'heal' as const, target: source, amount: 1, source },
      { t: 'heal' as const, target, amount: 1, source },
    ];
  },
};

export const jieyin: Skill = {
  id: 'jieyin',
  locked: false,
  active: jieyinActive,
  activeLimit: 'once_per_turn',
  activeCardCount: 2,
};
