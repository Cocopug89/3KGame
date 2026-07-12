// 苦肉 (Huang Gai) — action phase: lose 1 HP, then draw 2 cards. Standard
// edition (cross-checked — this is a version-sensitive skill, see below):
// "出牌阶段，你可以失去1点体力，然后摸两张牌。" UNLIMITED per turn in Standard;
// only the 界限突破 reprint ("苦肉计") limits it to once per action phase and
// adds a discard cost — out of scope (three-kingdoms-plan.md: Standard
// edition only for v1).
//
// Uses the {t:'loseHp'} primitive (task 4.3, frames.ts/pump.ts), NOT
// {t:'damage'} — this is not 伤害, so 奸雄/反馈/刚烈/遗计 correctly never see
// it. No HP floor in `canPlay`: 黄盖 may use this even at 1 hp, which opens a
// dying window on himself with his own `act` request still queued underneath
// — the exact F1 wedge phase-2-review flagged and 3.2 fixed (skill-trigger-
// design §9). If this ever throws or wedges, that fix is what to re-check
// first, not this file.

import type { CardEffect } from '../effectTypes.js';
import type { Skill } from '../skillTypes.js';
import type { PlayerId } from '../../engine/state.js';

const kurouActive: CardEffect = {
  key: 'skill.kurou',
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => true,
  resolve: (_G, ctx) => {
    const source = ctx.source as PlayerId;
    return [
      { t: 'loseHp', target: source, amount: 1 },
      { t: 'draw', player: source, count: 2 },
    ];
  },
};

export const kurou: Skill = {
  id: 'kurou',
  locked: false,
  active: kurouActive,
  // activeLimit omitted ⇒ unlimited (Standard edition — see header).
};
