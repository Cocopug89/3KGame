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
// Task 3.4's complex tricks + 3.3b's 五谷丰登. `indulgence`/`lightning` are
// delayed tricks — see each file's header for the `nullify:'none'` timing-trap
// note (judgement-nullification-design §3). `*_result`/`lightning_pass` are
// internal onResult/travel handlers, dispatched the same way nullify_window/
// dying_window are, not cards a player ever plays directly.
import { duel } from './effects/duel.js';
import { barbarianInvasion } from './effects/barbarianInvasion.js';
import { rainingArrows } from './effects/rainingArrows.js';
import { peachGarden } from './effects/peachGarden.js';
import { duress } from './effects/duress.js';
import { indulgence, indulgenceResult } from './effects/indulgence.js';
import { lightning, lightningResult, lightningPass } from './effects/lightning.js';
import { harvest } from './effects/harvest.js';
// Task 3.5/3.6's equipment. `equip` is the one CardEffect shared by all 13
// equipment effectKeys (engine-design §3: "equipping IS the effect"); the
// other four are internal resume continuations, dispatched the same way
// nullify_window/dying_window are — see each file's own header comment.
import { equip } from './effects/equip.js';
import { eightTrigramsResult } from './effects/eightTrigrams.js';
import { frostBladeDiscard } from './effects/frostBlade.js';
import { rockCleavingAxeHit } from './effects/rockCleavingAxe.js';
import { genderSwordsGift } from './effects/genderSwords.js';
// Task 4.3 (Batch B)'s internal resume continuations — dispatched through
// {t:'resume'}/{t:'effect'} exactly like the ones above, not cards a player
// ever plays directly. Each lives in its skill's own file (server/src/
// content/skills/*.ts), not under effects/, since they're skill-only.
import { fankuiTake } from './skills/fankui.js';
import { ganglieResult, ganglieChoice, ganglieDiscard } from './skills/ganglie.js';
import { luoshenResult, luoshenChoice } from './skills/luoshen.js';
import { tuxiSteal } from './skills/tuxi.js';
// Task 4.4 (Batch C)'s internal resume continuations — see
// docs/handoff/4.4-batchC-skills.md.
import { yijiDistribute } from './effects/yijiDistribute.js';
import { tiejiResult } from './effects/tiejiResult.js';
import { lordProxyEffect } from './effects/lordProxy.js';

const hujiaProxy = lordProxyEffect({ key: 'hujia_proxy', kind: 'dodge', kingdom: 'wei' });
const jijiangProxy = lordProxyEffect({ key: 'jijiang_proxy', kind: 'strike', kingdom: 'shu' });

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
  // Task 3.4's complex tricks + 3.3b's 五谷丰登 (docs/handoff/3.4-complex-tricks.md).
  duel,
  barbarian_invasion: barbarianInvasion,
  raining_arrows: rainingArrows,
  peach_garden: peachGarden,
  duress,
  indulgence,
  indulgence_result: indulgenceResult,
  lightning,
  lightning_result: lightningResult,
  lightning_pass: lightningPass,
  harvest,
  // Task 3.5's equipment zone: one shared CardEffect ("equipping IS the
  // effect", engine-design §3) registered under all 13 equipment effectKeys —
  // 9 weapons + 2 armour + 2 horse directions (content/effects/equip.ts).
  zhuge_crossbow: equip,
  gender_swords: equip,
  blue_steel_sword: equip,
  frost_blade: equip,
  rock_cleaving_axe: equip,
  green_dragon_blade: equip,
  serpent_spear: equip,
  heaven_scorcher: equip,
  unicorn_bow: equip,
  eight_trigrams: equip,
  renwang_shield: equip,
  plus_horse: equip,
  minus_horse: equip,
  // Task 3.6's weapon/armour resume continuations — dispatched through
  // {t:'resume'}/{t:'effect'} exactly like nullify_window/dying_window above.
  eight_trigrams_result: eightTrigramsResult,
  frost_blade_discard: frostBladeDiscard,
  rock_cleaving_axe_hit: rockCleavingAxeHit,
  gender_swords_gift: genderSwordsGift,
  // Task 4.3 (Batch B)'s internal continuations.
  fankui_take: fankuiTake,
  ganglie_result: ganglieResult,
  ganglie_choice: ganglieChoice,
  ganglie_discard: ganglieDiscard,
  luoshen_result: luoshenResult,
  luoshen_choice: luoshenChoice,
  tuxi_steal: tuxiSteal,
  // Task 4.4 (Batch C)'s internal continuations.
  yiji_distribute: yijiDistribute,
  tieji_result: tiejiResult,
  hujia_proxy: hujiaProxy,
  jijiang_proxy: jijiangProxy,
};
