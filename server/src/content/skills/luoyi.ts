// 裸衣 (Xu Chu) — in your draw phase, you may draw one fewer card; if you do,
// damage you deal with a 杀 or 决斗 this turn is +1. Standard text
// (cross-checked, and the one skill 4.1a's source cross-check corrected —
// skill-trigger-design §11): "摸牌阶段，你可以少摸一张牌；若如此做，本回合你使用
// 【杀】或【决斗】造成的伤害+1。"
//
// THE SPLIT PATTERN (§11's worked example, and the reason {t:'flag'} exists
// at all): 裸衣 is optional, not 锁定技, so it cannot be a plain locked query —
// a fold cannot stop and ask (§4). It splits into an OPTIONAL trigger that
// makes the choice and writes a turn flag, plus MANDATORY handlers that read
// it: `drawCount` (a locked query — content/standard/skills.json's own
// `locked: false` is display-only, engine/skills.test.ts's own 裸衣 fixture
// confirms the registry entry is `locked: true`) and a mandatory
// `damage.before` trigger. `Skill.locked` gates whether the QUERY half may
// answer a LOCKED_ONLY_QUERY (queryTypes.ts's assertQueryProvider); it is
// unrelated to `SkillTrigger.optional`, which is what actually makes the
// draw-phase choice prompt.
//
// 决斗's damage frame did not carry `card` before task 4.3 (duel.ts) — added
// there specifically so this handler can tell "杀 or 决斗" apart from
// card-less AoE damage (南蛮入侵/万箭齐发), which must NOT get the bonus.

import type { Skill } from '../skillTypes.js';
import type { SkillTrigger } from '../triggerTypes.js';
import type { Frame } from '../../engine/frames.js';
import { getCard } from '../../engine/cardIndex.js';

const FLAG = 'luoyi';

const luoyiDrawTrigger: SkillTrigger = {
  id: 'skill.luoyi.draw',
  event: 'phase.start',
  optional: true,
  labelKey: 'skill.luoyi.name',
  when: (e, _G, owner) => e.event === 'phase.start' && e.phase === 'draw' && e.player === owner,
  effect: (): Frame[] => [{ t: 'flag', key: FLAG, value: true }],
};

const luoyiDamageTrigger: SkillTrigger = {
  id: 'skill.luoyi.damage',
  event: 'damage.before',
  // Mandatory once the turn's choice has been made — the choice itself
  // already cost one prompt (luoyiDrawTrigger, above); this half must not
  // cost a second one.
  optional: false,
  when: (_e, G, owner) => {
    if (G.turnFlags[FLAG] !== true) return false;
    const d = G.damage;
    if (!d || d.source !== owner || d.prevented || !d.card) return false;
    const effectKey = getCard(d.card).effectKey;
    return effectKey === 'strike' || effectKey === 'duel';
  },
  effect: (_e, G): Frame[] => {
    const d = G.damage;
    if (!d) return [];
    return [{ t: 'setDamage', patch: { amount: d.amount + 1 } }];
  },
};

export const luoyi: Skill = {
  id: 'luoyi',
  locked: true,
  triggers: [luoyiDrawTrigger, luoyiDamageTrigger],
  queries: {
    drawCount: (G, _owner, current) => (G.turnFlags[FLAG] === true ? current - 1 : current),
  },
};
