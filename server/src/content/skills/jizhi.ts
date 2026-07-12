// 集智 (Huang Yueying) — whenever you play a non-delayed trick card, draw 1.
// Standard text: "当你使用非延时类锦囊牌时，你可以摸一张牌。"
//
// Keyed off `effectKey`, not the physical card's `type` — 视为 (甘宁's 奇袭,
// 4.2/Batch A: a black BASIC card played AS 过河拆桥) still counts, because
// the rule is about what's being USED, and `cardsAs` already validated that
// claim before `card.play` fired (skill-trigger-design §4.1). The delayed set
// is exactly the two effectKeys phases.ts's `delayedTrickOnNullified`
// special-cases (乐不思蜀/闪电); every other trick effectKey in
// content/standard/cards.json resolves immediately.

import type { Skill } from '../skillTypes.js';
import type { Frame } from '../../engine/frames.js';

const NON_DELAYED_TRICK_EFFECT_KEYS = new Set([
  'barbarian_invasion',
  'dismantle',
  'draw_two',
  'duel',
  'duress',
  'harvest',
  'peach_garden',
  'raining_arrows',
  'steal',
]);

export const jizhi: Skill = {
  id: 'jizhi',
  locked: false,
  triggers: [
    {
      id: 'skill.jizhi',
      event: 'card.play',
      optional: true,
      labelKey: 'skill.jizhi.name',
      when: (e, _G, owner) =>
        e.event === 'card.play' && e.source === owner && NON_DELAYED_TRICK_EFFECT_KEYS.has(e.effectKey),
      effect: (_e, _G, owner): Frame[] => [{ t: 'draw', player: owner, count: 1 }],
    },
  ],
};
