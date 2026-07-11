// 贯石斧 Rock-Cleaving Axe (range 3): when your 杀 is dodged, you may discard 2
// of YOUR OWN cards to force it through for 1 damage anyway. Mirrors
// frostBlade.ts's shape (an optional trigger, a 2-card cost paid one
// chooseCard at a time, a shared frame-builder reused by the resume) but
// spends the OWNER's own cards rather than the target's, and ends in a fresh
// {t:'damage'} instead of a {t:'setDamage'} patch — the 闪 already succeeded,
// this is a brand new hit riding on the same 杀.

import type { CardEffect } from '../effectTypes.js';
import type { SkillTrigger } from '../triggerTypes.js';
import type { Frame, Zone } from '../../engine/frames.js';
import type { CardId, GState, PlayerId } from '../../engine/state.js';
import { cardChoicesFor } from '../../engine/cardChoice.js';

export interface RockCleavingAxeHitCtx {
  owner: PlayerId;
  target: PlayerId;
  card: CardId;
  remaining: number;
  chosen?: CardId;
  chosenZone?: Zone;
}

export function rockCleavingAxeHitFrames(G: GState, ctx: RockCleavingAxeHitCtx): Frame[] {
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

  if (remaining > 0) {
    const choices = cardChoicesFor(G, ctx.owner);
    if (choices.length === 0) {
      // Couldn't fully pay the cost — `when()` only checked availability at
      // fan-out time; something earlier in the SAME fan-out could have
      // emptied the owner's hand/equip/judgement zone since. Abort rather
      // than force the hit on a discount that was never offered.
      return frames;
    }
    frames.push(
      {
        t: 'request',
        req: {
          kind: 'chooseCard',
          playerId: ctx.owner,
          target: ctx.owner,
          reasonKey: 'choose.rock_cleaving_axe',
          choices,
        },
      },
      {
        t: 'resume',
        effectKey: 'rock_cleaving_axe_hit',
        ctx: { owner: ctx.owner, target: ctx.target, card: ctx.card, remaining },
      },
    );
    return frames;
  }

  // Both cards paid — the 杀 still deals its damage. The dead-subject rule
  // (pump.ts) drops this on its own if the target died in the meantime.
  frames.push({
    t: 'damage',
    source: ctx.owner,
    target: ctx.target,
    amount: 1,
    kind: 'normal',
    card: ctx.card,
  });
  return frames;
}

export const rockCleavingAxeTrigger: SkillTrigger = {
  id: 'equip.rock_cleaving_axe',
  event: 'strike.dodged',
  optional: true,
  priority: 100,
  labelKey: 'card.rock_cleaving_axe',
  when: (e, G, owner) =>
    e.event === 'strike.dodged' && e.source === owner && cardChoicesFor(G, owner).length >= 2,
  effect: (e, G, owner) => {
    if (e.event !== 'strike.dodged') return [];
    return rockCleavingAxeHitFrames(G, { owner, target: e.target, card: e.card, remaining: 2 });
  },
};

export const rockCleavingAxeHit: CardEffect = {
  key: 'rock_cleaving_axe_hit',
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,
  resolve: (G, rawCtx) => rockCleavingAxeHitFrames(G, rawCtx as unknown as RockCleavingAxeHitCtx),
};
