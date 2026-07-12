// 青囊 (Hua Tuo) — action phase, once per turn: discard a hand card to heal
// any ONE wounded player (including yourself) 1 HP. Standard text: "出牌阶段
// 限一次，你可以弃置一张手牌，令一名已受伤的角色回复1点体力。"
//
// An ACTIVE skill (skill-trigger-design §1's third face): the `useSkill` move
// (bgio/game.ts) already validates the card is in hand and the target is
// legal against `targeting` — it does NOT discard the card itself (that's the
// active's job, same note as 制衡/仁德/苦肉), so resolve() has to push the
// {t:'moveCards'} for the cost as well as the {t:'heal'}.

import type { CardEffect } from '../effectTypes.js';
import type { Skill } from '../skillTypes.js';
import type { CardId, PlayerId } from '../../engine/state.js';

const qingnangActive: CardEffect = {
  key: 'skill.qingnang',
  targeting: {
    min: 1,
    max: 1,
    self: 'allowed',
    predicate: (G, _self, candidate) => {
      const p = G.players[candidate];
      return !!p && p.hp < p.maxHp;
    },
  },
  canPlay: () => true,
  resolve: (_G, ctx) => {
    const source = ctx.source as PlayerId;
    const cards = ctx.cards as CardId[];
    const targets = ctx.targets as PlayerId[];
    if (cards.length !== 1 || targets.length !== 1) return []; // malformed call — refuse silently
    const [target] = targets;
    return [
      { t: 'moveCards', cards, from: { z: 'hand', player: source }, to: { z: 'discard' }, by: source },
      { t: 'heal', target, amount: 1, source, card: cards[0] },
    ];
  },
};

export const qingnang: Skill = {
  id: 'qingnang',
  locked: false,
  active: qingnangActive,
  activeLimit: 'once_per_turn',
};
