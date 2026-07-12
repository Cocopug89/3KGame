// Every skill, keyed exactly by content/standard/skills.json's `id` (task 4.1a).
//
// EMPTY ON PURPOSE — and that is the definition of done for 4.1b. The whole
// point of this task is that a skill is *pure content*: by the time 4.2 writes
// 武圣, there is nothing left to build in the engine, and the diff is one file
// under content/skills/ plus one line here. If a skill handler was tempting
// mid-4.1b, it meant a mechanism was missing and was about to be hidden inside
// a skill.
//
// 4.2 (Batch A — queries), 4.3 (Batch B — reactive triggers) and 4.4 (Batch C —
// proxies/retrials/actives) fill it in. The catalog of all 40, with hook ·
// optional · limit · batch for each, is docs/skill-trigger-design.md §8.

import type { SkillRegistry } from './skillTypes.js';
import * as batchA from './skills/batchA.js';
import * as batchB from './skills/batchB.js';
import * as batchC from './skills/batchC.js';

export const skillRegistry: SkillRegistry = {
  wusheng: batchA.wusheng,
  paoxiao: batchA.paoxiao,
  longdan: batchA.longdan,
  qingguo: batchA.qingguo,
  kongcheng: batchA.kongcheng,
  mashu: batchA.mashu,
  yingzi: batchA.yingzi,
  qicai: batchA.qicai,
  qianxun: batchA.qianxun,
  qixi: batchA.qixi,
  biyue: batchA.biyue,
  keji: batchA.keji,
  // Batch B (4.3) — 12 reactive skills, docs/finish-workflow-plan.md's Lane E.
  jianxiong: batchB.jianxiong,
  fankui: batchB.fankui,
  ganglie: batchB.ganglie,
  tuxi: batchB.tuxi,
  luoyi: batchB.luoyi,
  luoshen: batchB.luoshen,
  jizhi: batchB.jizhi,
  zhiheng: batchB.zhiheng,
  kurou: batchB.kurou,
  lianying: batchB.lianying,
  xiaoji: batchB.xiaoji,
  qingnang: batchB.qingnang,
  // Batch C (4.4) — 15 complex skills + 国色 pickup, this lane (F).
  hujia: batchC.hujia,
  guicai: batchC.guicai,
  tiandu: batchC.tiandu,
  yiji: batchC.yiji,
  rende: batchC.rende,
  jijiang: batchC.jijiang,
  guanxing: batchC.guanxing,
  tieji: batchC.tieji,
  jiuyuan: batchC.jiuyuan,
  fanjian: batchC.fanjian,
  liuli: batchC.liuli,
  jieyin: batchC.jieyin,
  jijiu: batchC.jijiu,
  wushuang: batchC.wushuang,
  lijian: batchC.lijian,
  guose: batchC.guose,
};

/** The registry key an active skill's CardEffect is dispatched under (the
 * `useSkill` move pushes `{t:'effect', effectKey: activeEffectKey(id)}`).
 * Namespaced so a skill can never collide with a card's effectKey. */
export function activeEffectKey(skillId: string): string {
  return `skill.${skillId}`;
}
