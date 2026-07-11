// 寒冰剑 Frost Blade (range 2): when calculating damage from your 杀, you may
// PREVENT it and instead discard 2 of the target's cards (your choice, of
// theirs). skill-trigger-design §2.1 names this card as the reason
// damage.before is a request-capable event rather than a synchronous fold
// ("寒冰剑 falsifies it: optional, blocking, damage-preventing").
//
// The 2-card discard reuses `chooseCard` (engine/cardChoice.ts) — the same
// "attacker points at one of a player's cards, by slot" mechanism 3.3's
// 过河拆桥/顺手牵羊 built — asked twice in sequence rather than teaching
// chooseCard to hand back more than one card at a time. `frostBladeDiscardFrames`
// is shared between the trigger's own first ask and its `resume` continuation
// so there is exactly one place that decides "ask again vs stop."

import type { CardEffect } from '../effectTypes.js';
import type { SkillTrigger } from '../triggerTypes.js';
import type { Frame, Zone } from '../../engine/frames.js';
import type { CardId, GState, PlayerId } from '../../engine/state.js';
import { getCard } from '../../engine/cardIndex.js';
import { cardChoicesFor } from '../../engine/cardChoice.js';

export interface FrostBladeDiscardCtx {
  owner: PlayerId;
  target: PlayerId;
  /** How many of the target's cards are still owed. */
  remaining: number;
  /** Set by the chooseCard move's applyToResumeFrame once an answer lands. */
  chosen?: CardId;
  chosenZone?: Zone;
}

/** Shared by the trigger's initial `effect()` and the `frost_blade_discard`
 * resume: apply whatever was just chosen (if anything), then either ask again
 * or stop — remaining reaches 0, or the target has nothing left to take. */
export function frostBladeDiscardFrames(G: GState, ctx: FrostBladeDiscardCtx): Frame[] {
  const frames: Frame[] = [];
  let remaining = ctx.remaining;

  if (ctx.chosen && ctx.chosenZone) {
    frames.push({
      t: 'moveCards',
      cards: [ctx.chosen],
      from: ctx.chosenZone,
      to: { z: 'discard' },
      by: ctx.owner,
    });
    remaining -= 1;
  }

  if (remaining <= 0) return frames;

  const choices = cardChoicesFor(G, ctx.target);
  if (choices.length === 0) return frames; // nothing left to take — stop early, not an error

  frames.push(
    {
      t: 'request',
      req: {
        kind: 'chooseCard',
        playerId: ctx.owner,
        target: ctx.target,
        reasonKey: 'choose.frost_blade',
        choices,
      },
    },
    {
      t: 'resume',
      effectKey: 'frost_blade_discard',
      ctx: { owner: ctx.owner, target: ctx.target, remaining },
    },
  );
  return frames;
}

export const frostBladeTrigger: SkillTrigger = {
  id: 'equip.frost_blade',
  event: 'damage.before',
  optional: true,
  priority: 100,
  labelKey: 'card.frost_blade',
  when: (_e, G, owner) => {
    const d = G.damage;
    if (!d || d.source !== owner || d.prevented || d.amount <= 0) return false;
    return d.card !== undefined && getCard(d.card).effectKey === 'strike';
  },
  effect: (_e, G, owner) => {
    const d = G.damage;
    if (!d) return [];
    return [
      { t: 'setDamage', patch: { prevented: true } },
      ...frostBladeDiscardFrames(G, { owner, target: d.target, remaining: 2 }),
    ];
  },
};

export const frostBladeDiscard: CardEffect = {
  key: 'frost_blade_discard',
  // Never played, never targeted — an internal continuation, like nullify_window.
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,
  resolve: (G, rawCtx) => frostBladeDiscardFrames(G, rawCtx as unknown as FrostBladeDiscardCtx),
};
