// 雌雄双股剑 Gender Swords (range 2): when you 杀 a character of the opposite
// gender, you may make them choose: give you a hand card, or you draw one.
// skill-trigger-design's own table names this card as the 3.6 example of the
// `card.target` event ("after targets are locked, before that target
// responds" — strike.ts already emits it for every target).
//
// Simplification, flagged for whoever next needs it: the true choice between
// the two options belongs to the TARGET, but there is no existing request
// kind for "offer player X a binary choice" (confirmSkill's yes/no is always
// answered by the TRIGGER OWNER, never an arbitrary other player — see
// docs/handoff/3.5-3.6-equipment.md). What this DOES preserve faithfully: WHICH
// card to give is the target's own choice — reusing chooseCard with
// `playerId === target === target` (a player pointing at their own zones,
// exactly like rockCleavingAxe.ts's self-choice) rather than letting the
// attacker pick. When the target has nothing to give, this correctly falls
// back to "you draw a card" without ever asking.

import type { CardEffect } from '../effectTypes.js';
import type { SkillTrigger } from '../triggerTypes.js';
import type { Zone } from '../../engine/frames.js';
import type { CardId, GState, PlayerId } from '../../engine/state.js';
import { generals } from '@3k/shared';
import { cardChoicesFor } from '../../engine/cardChoice.js';

function genderOf(G: GState, playerId: PlayerId): 'male' | 'female' | undefined {
  const player = G.players[playerId];
  if (!player) return undefined;
  return generals.find((g) => g.id === player.generalId)?.gender;
}

export const genderSwordsTrigger: SkillTrigger = {
  id: 'equip.gender_swords',
  event: 'card.target',
  optional: true,
  limit: 'once_per_turn', // 出牌阶段限一次
  priority: 100,
  labelKey: 'card.gender_swords',
  when: (e, G, owner) => {
    if (e.event !== 'card.target' || e.effectKey !== 'strike' || e.source !== owner) return false;
    const a = genderOf(G, e.source);
    const b = genderOf(G, e.target);
    return !!a && !!b && a !== b;
  },
  effect: (e, G, owner) => {
    if (e.event !== 'card.target') return [];
    const target = e.target;
    const choices = cardChoicesFor(G, target);
    if (choices.length === 0) {
      return [{ t: 'draw', player: owner, count: 1 }];
    }
    return [
      {
        t: 'request',
        req: {
          kind: 'chooseCard',
          playerId: target,
          target,
          reasonKey: 'choose.gender_swords',
          choices,
        },
      },
      { t: 'resume', effectKey: 'gender_swords_gift', ctx: { owner, target } },
    ];
  },
};

export const genderSwordsGift: CardEffect = {
  key: 'gender_swords_gift',
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,
  resolve: (_G, ctx) => {
    const owner = ctx.owner as PlayerId;
    const chosen = ctx.chosen as CardId | undefined;
    const chosenZone = ctx.chosenZone as Zone | undefined;
    if (!chosen || !chosenZone) return [{ t: 'draw', player: owner, count: 1 }];
    return [
      { t: 'moveCards', cards: [chosen], from: chosenZone, to: { z: 'hand', player: owner }, by: owner },
    ];
  },
};
