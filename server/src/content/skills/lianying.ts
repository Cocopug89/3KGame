// 连营 (Lu Xun) — whenever your hand reaches ZERO cards, draw 1. Standard
// text: "每当你的手牌数为0时，你可以摸一张牌。" Read live off G (hand.length),
// not off the event payload, so it is correct even when several cards leave
// at once (制衡's discard) — the event only says A card left; `when()`
// re-checks the actual result.

import type { Skill } from '../skillTypes.js';
import type { Frame } from '../../engine/frames.js';

export const lianying: Skill = {
  id: 'lianying',
  locked: false,
  triggers: [
    {
      id: 'skill.lianying',
      event: 'card.lost',
      optional: true,
      labelKey: 'skill.lianying.name',
      when: (e, G, owner) =>
        e.event === 'card.lost' && e.player === owner && e.from === 'hand' && G.players[owner].hand.length === 0,
      effect: (_e, _G, owner): Frame[] => [{ t: 'draw', player: owner, count: 1 }],
    },
  ],
};
