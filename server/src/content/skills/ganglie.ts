// 刚烈 (Xiahou Dun) — after you take damage, you may judge; if the result is
// not a Heart, the DAMAGE SOURCE chooses: discard two of their own hand
// cards, or take 1 damage from you. Standard text (cross-checked via a second
// source, since this is the one skill whose "who chooses / who pays" reads
// ambiguously from the design doc's one-line summary): "当你受到伤害后，你可以
// 进行判定，若结果不为红桃，伤害来源选择一项：1.弃置两张手牌；2.受到你造成的1点
// 伤害。" Also confirmed: HP LOST WITHOUT damage (e.g. 苦肉) does not trigger
// this — consistent with skill-trigger-design's damage/loseHp split (task
// 4.3's frames.ts comment on 'loseHp').
//
// ⚠️ The skill id is `ganglie` (content/standard/skills.json / locales), NOT
// `gangli` — the file was briefly misnamed under the wrong id and renamed
// here before the batch shipped.
//
// `judgeResult`'s onResult ctx is only ever {target, judgeCard, sourceCard} —
// it has no room for "which player dealt the damage," and the damage source
// is a different player from `owner` (the judge's target). That's threaded
// through a {t:'flag'} write (skill-trigger-design §2.2's sanctioned channel
// for exactly this), safe here because the whole judge → result → choice
// chain resolves synchronously on one stack before a second 刚烈 instance
// could ever start (there is only one 夏侯惇 in a Standard game in any case).
//
// The discard-2 cost reuses the same "ask chooseCard twice, shared frame
// builder" shape as frostBlade.ts/rockCleavingAxe.ts, restricted to the
// SOURCE's own HAND (弃置两张手牌 names the hand, not equipment) rather than
// cardChoicesFor's three-zone set.

import type { CardEffect } from '../effectTypes.js';
import type { Skill } from '../skillTypes.js';
import type { SkillTrigger } from '../triggerTypes.js';
import type { Frame, Zone } from '../../engine/frames.js';
import type { CardId, GState, PlayerId } from '../../engine/state.js';
import { getCard } from '../../engine/cardIndex.js';

const SOURCE_FLAG = 'ganglie.pendingSource';

interface GanglieDiscardCtx {
  source: PlayerId;
  remaining: number;
  chosen?: CardId;
  chosenZone?: Zone;
}

function ganglieDiscardFrames(G: GState, ctx: GanglieDiscardCtx): Frame[] {
  const frames: Frame[] = [];
  let remaining = ctx.remaining;

  if (ctx.chosen && ctx.chosenZone) {
    frames.push({ t: 'moveCards', cards: [ctx.chosen], from: ctx.chosenZone, to: { z: 'discard' }, by: ctx.source });
    remaining -= 1;
  }
  if (remaining <= 0) return frames;

  const hand = G.players[ctx.source]?.hand ?? [];
  if (hand.length === 0) return frames; // fewer than 2 cards — pays what they have, not an error

  const choices = hand.map((_, index) => ({ z: 'hand' as const, index }));
  frames.push(
    {
      t: 'request',
      req: { kind: 'chooseCard', playerId: ctx.source, target: ctx.source, reasonKey: 'choose.ganglie_discard', choices },
    },
    { t: 'resume', effectKey: 'ganglie_discard', ctx: { source: ctx.source, remaining } },
  );
  return frames;
}

const ganglieTrigger: SkillTrigger = {
  id: 'skill.ganglie',
  event: 'damage.after',
  optional: true,
  labelKey: 'skill.ganglie.name',
  when: (e, G, owner) =>
    e.event === 'damage.after' && e.target === owner && e.source !== null && G.players[e.source]?.alive === true,
  effect: (e, _G, owner): Frame[] => {
    if (e.event !== 'damage.after' || e.source === null) return [];
    return [
      { t: 'flag', key: SOURCE_FLAG, value: e.source },
      { t: 'judge', target: owner, reasonKey: 'judge.ganglie', onResult: 'ganglie_result' },
    ];
  },
};

const ganglieResult: CardEffect = {
  key: 'ganglie_result',
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,
  resolve: (G, ctx) => {
    const owner = ctx.target as PlayerId;
    const judgeCard = ctx.judgeCard as CardId | undefined;
    if (!judgeCard) return [];
    if (getCard(judgeCard).suit === 'hearts') return [];
    const source = G.turnFlags[SOURCE_FLAG] as PlayerId | undefined;
    if (!source || !G.players[source]?.alive) return [];
    return [
      {
        t: 'request',
        req: {
          kind: 'chooseOption',
          playerId: source,
          reasonKey: 'choose.ganglie',
          options: [
            { id: 'discard_two', labelKey: 'option.ganglie.discard_two' },
            { id: 'take_damage', labelKey: 'option.ganglie.take_damage' },
          ],
        },
      },
      { t: 'resume', effectKey: 'ganglie_choice', ctx: { owner, source } },
    ];
  },
};

const ganglieChoice: CardEffect = {
  key: 'ganglie_choice',
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,
  resolve: (G, ctx) => {
    const owner = ctx.owner as PlayerId;
    const source = ctx.source as PlayerId;
    if (ctx.chosenOption === 'take_damage') {
      return [{ t: 'damage', source: owner, target: source, amount: 1, kind: 'normal' }];
    }
    // 'discard_two', and the (unreachable in practice) fallback for anything
    // else — the cheaper-looking option is still an obligation, never a way
    // to pay nothing.
    return ganglieDiscardFrames(G, { source, remaining: 2 });
  },
};

const ganglieDiscard: CardEffect = {
  key: 'ganglie_discard',
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,
  resolve: (G, rawCtx) => ganglieDiscardFrames(G, rawCtx as unknown as GanglieDiscardCtx),
};

export const ganglie: Skill = {
  id: 'ganglie',
  locked: false,
  triggers: [ganglieTrigger],
};

// Internal effectRegistry entries this file also provides (effectRegistry.ts
// imports these three by name, same shape as frost_blade_discard/
// rock_cleaving_axe_hit).
export { ganglieResult, ganglieChoice, ganglieDiscard };
