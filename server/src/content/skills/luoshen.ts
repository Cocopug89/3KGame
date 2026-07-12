// 洛神 (Zhen Ji) — at the start of your prepare phase, you may judge; while
// the result is black, you may take the card into your hand and judge again.
// Standard text: "准备阶段开始时，你可以进行一次判定，若结果为黑色，你可以将其
// 收入手牌，然后可以重复此流程。"
//
// "Self-pushed loop, not a re-trigger" (skill-trigger-design §8): every
// repeat re-enters through a fresh {t:'judge'} pushed by the PREVIOUS result's
// own resolve(), never by re-firing `phase.start` — the initial optional
// confirmSkill prompt (§3.4) only ever happens once per prep phase.
//
// By the time `luoshenResult` runs, `judgeResult` (pump.ts) has already
// pushed the judgement card onto the discard pile — "收入手牌" is therefore a
// plain moveCards lifting it back out, the same move equip.ts/jianxiong.ts
// make from the same pile.

import type { CardEffect } from '../effectTypes.js';
import type { Skill } from '../skillTypes.js';
import type { SkillTrigger } from '../triggerTypes.js';
import type { CardId, PlayerId } from '../../engine/state.js';
import { getCard } from '../../engine/cardIndex.js';

const BLACK_SUITS = new Set(['spades', 'clubs']);

const luoshenTrigger: SkillTrigger = {
  id: 'skill.luoshen',
  event: 'phase.start',
  optional: true,
  labelKey: 'skill.luoshen.name',
  when: (e, _G, owner) => e.event === 'phase.start' && e.phase === 'prep' && e.player === owner,
  effect: (_e, _G, owner) => [
    { t: 'judge', target: owner, reasonKey: 'judge.luoshen', onResult: 'luoshen_result' },
  ],
};

const luoshenResult: CardEffect = {
  key: 'luoshen_result',
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,
  resolve: (_G, ctx) => {
    const owner = ctx.target as PlayerId;
    const judgeCard = ctx.judgeCard as CardId | undefined;
    if (!judgeCard || !BLACK_SUITS.has(getCard(judgeCard).suit)) return [];
    return [
      {
        t: 'request',
        req: {
          kind: 'chooseOption',
          playerId: owner,
          reasonKey: 'choose.luoshen',
          options: [
            { id: 'keep_and_repeat', labelKey: 'option.luoshen.keep_and_repeat' },
            { id: 'stop', labelKey: 'option.luoshen.stop' },
          ],
        },
      },
      { t: 'resume', effectKey: 'luoshen_choice', ctx: { owner, judgeCard } },
    ];
  },
};

const luoshenChoice: CardEffect = {
  key: 'luoshen_choice',
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,
  resolve: (G, ctx) => {
    const owner = ctx.owner as PlayerId;
    const judgeCard = ctx.judgeCard as CardId;
    if (ctx.chosenOption !== 'keep_and_repeat') return [];
    if (!G.discardPile.includes(judgeCard)) return []; // already gone — don't fabricate a card
    return [
      { t: 'moveCards', cards: [judgeCard], from: { z: 'discard' }, to: { z: 'hand', player: owner }, by: owner },
      { t: 'log', key: 'log.picks', params: { player: owner, card: judgeCard } },
      { t: 'judge', target: owner, reasonKey: 'judge.luoshen', onResult: 'luoshen_result' },
    ];
  },
};

export const luoshen: Skill = {
  id: 'luoshen',
  locked: false,
  triggers: [luoshenTrigger],
};

export { luoshenResult, luoshenChoice };
