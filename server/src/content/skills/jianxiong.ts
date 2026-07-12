// 奸雄 (Cao Cao) — after you take damage from a card, you may take that card
// into your hand. Standard text (cross-checked, 4.1a): "当你受到伤害后，你可以
// 获得对你造成伤害的牌。"
//
// `when()` is false when the damage had no card at all (skill-trigger-design
// §3.4's "skip the prompt when the answer cannot matter") — AoE damage
// (南蛮入侵/万箭齐发) and 决斗's backfire hit carry no single card, so there is
// nothing to gain. By the time `damage.after` fires, the card that dealt the
// damage is already sitting in the discard pile (playCard/supplyCards both
// discard before the effect resolves) — moving it out from there is the same
// "lift a card back out of the discard pile" move equip.ts/eightTrigrams.ts
// already make.

import type { Skill } from '../skillTypes.js';
import type { Frame } from '../../engine/frames.js';

export const jianxiong: Skill = {
  id: 'jianxiong',
  locked: false,
  triggers: [
    {
      id: 'skill.jianxiong',
      event: 'damage.after',
      optional: true,
      labelKey: 'skill.jianxiong.name',
      when: (e, G, owner) =>
        e.event === 'damage.after' &&
        e.target === owner &&
        e.card !== undefined &&
        G.discardPile.includes(e.card),
      effect: (e, _G, owner): Frame[] => {
        if (e.event !== 'damage.after' || !e.card) return [];
        return [
          {
            t: 'moveCards',
            cards: [e.card],
            from: { z: 'discard' },
            to: { z: 'hand', player: owner },
            by: owner,
          },
          { t: 'log', key: 'log.picks', params: { player: owner, card: e.card } },
        ];
      },
    },
  ],
};
