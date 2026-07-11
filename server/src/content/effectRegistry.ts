// Collects every CardEffect module into one registry keyed exactly by
// content/standard/cards.json's `effectKey` (docs/engine-design.md §3, §1).
// Grows one entry per task as Phase 3/4 add tricks/equipment/skills.
//
// `nullify_window` and `dying_window` are not cards — they are the internal
// effects that implement the 无懈可击 chain (judgement-nullification-design §2)
// and the 濒死 window's continuation (task 4.1b). They live here because
// "multi-step thing dispatched through the registry with a resume frame" is
// exactly what the registry is for, and giving either a bespoke frame type
// would duplicate machinery that already works.
//
// ACTIVE SKILLS are dispatched through the same machinery but are NOT in this
// map: they are looked up under `skill.<id>` in the skill registry (see
// pump.ts's findEffect), so a skill can never collide with a card's effectKey.

import type { EffectRegistry } from './effectTypes.js';
import { strike } from './effects/strike.js';
import { dodge } from './effects/dodge.js';
import { peach } from './effects/peach.js';
import { nullification } from './effects/nullification.js';
import { nullifyWindow } from './effects/nullifyWindow.js';
import { dyingWindow } from './effects/dyingWindow.js';
import { dismantle } from './effects/dismantle.js';
import { steal } from './effects/steal.js';
import { drawTwo } from './effects/drawTwo.js';

export const effectRegistry: EffectRegistry = {
  strike,
  dodge,
  peach,
  nullification,
  nullify_window: nullifyWindow,
  dying_window: dyingWindow,
  // Task 3.3's instant tricks. 过河拆桥/顺手牵羊 share one body (effects/
  // takeOneCard.ts) and ask through the slot-based `chooseCard` request.
  dismantle,
  steal,
  draw_two: drawTwo,
};
