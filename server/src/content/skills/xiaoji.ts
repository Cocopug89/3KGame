// 枭姬 (Sun Shangxiang) — whenever you lose a piece of equipment (stolen,
// discarded, or REPLACED by a new one), draw 2. Standard text: "当你失去装备区
// 里的牌时，你可以摸两张牌。" Needs task 3.5's equipment zone (done) and task
// 4.3's fix to `putInZone`'s equip-slot branch (pump.ts) — replacing a piece
// of equipment used to discard the old occupant silently, with no `card.lost`
// emission at all, which was harmless until this skill became the first
// listener that needed to hear it.

import type { Skill } from '../skillTypes.js';
import type { Frame } from '../../engine/frames.js';

export const xiaoji: Skill = {
  id: 'xiaoji',
  locked: false,
  triggers: [
    {
      id: 'skill.xiaoji',
      event: 'card.lost',
      optional: true,
      labelKey: 'skill.xiaoji.name',
      when: (e, _G, owner) => e.event === 'card.lost' && e.player === owner && e.from === 'equip',
      effect: (_e, _G, owner): Frame[] => [{ t: 'draw', player: owner, count: 2 }],
    },
  ],
};
