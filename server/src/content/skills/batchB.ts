// Batch B (4.3) — 12 reactive skills (skill-trigger-design §8, docs/
// finish-workflow-plan.md's Lane E): 奸雄/反馈/刚烈/突袭/裸衣/洛神/集智/制衡/
// 苦肉/连营/枭姬/青囊. Registers exactly one import line into
// skillRegistry.ts, per the batch-barrel convention 4.2 established.
//
// Four of these files also export internal effectRegistry entries — resume
// continuations for a multi-step trigger, dispatched the same way
// nullify_window/frost_blade_discard already are (刚烈: ganglieResult/
// ganglieChoice/ganglieDiscard; 洛神: luoshenResult/luoshenChoice; 反馈:
// fankuiTake; 突袭: tuxiSteal). effectRegistry.ts imports those directly from
// each skill file, not through this barrel.

export { jianxiong } from './jianxiong.js';
export { fankui } from './fankui.js';
export { ganglie } from './ganglie.js';
export { tuxi } from './tuxi.js';
export { luoyi } from './luoyi.js';
export { luoshen } from './luoshen.js';
export { jizhi } from './jizhi.js';
export { zhiheng } from './zhiheng.js';
export { kurou } from './kurou.js';
export { lianying } from './lianying.js';
export { xiaoji } from './xiaoji.js';
export { qingnang } from './qingnang.js';
