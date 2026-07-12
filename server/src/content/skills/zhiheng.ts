// 制衡 (Sun Quan) — action phase, once per turn: discard any number of hand
// cards (including zero), then draw that many. Standard text (cross-checked —
// the "any number" is a plain discard-and-redraw, NOT a bottom-of-draw-pile
// placement, which is a different skill this project doesn't ship): "出牌阶段
// 限一次，你可以弃置任意张牌，然后摸等量的牌。"

import type { CardEffect } from '../effectTypes.js';
import type { Skill } from '../skillTypes.js';
import type { Frame } from '../../engine/frames.js';
import type { CardId, PlayerId } from '../../engine/state.js';

const zhihengActive: CardEffect = {
  key: 'skill.zhiheng',
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => true,
  resolve: (_G, ctx) => {
    const source = ctx.source as PlayerId;
    const cards = ctx.cards as CardId[];
    const frames: Frame[] = [];
    if (cards.length > 0) {
      frames.push({ t: 'moveCards', cards, from: { z: 'hand', player: source }, to: { z: 'discard' }, by: source });
    }
    frames.push({ t: 'draw', player: source, count: cards.length });
    return frames;
  },
};

export const zhiheng: Skill = {
  id: 'zhiheng',
  locked: false,
  active: zhihengActive,
  activeLimit: 'once_per_turn',
};
