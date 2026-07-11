// The shared body of 过河拆桥 and 顺手牵羊 (plan §3.2, judgement-nullification-
// design §5). The two cards differ in exactly two ways — range, and where the
// stolen card ends up — so they share one two-step resolve() rather than being
// copy-pasted:
//
//   step 1  ask the SOURCE (not the target) to point at one of the target's
//           cards — a {kind:'chooseCard'} request carrying opaque hand slots
//           (engine/cardChoice.ts). Come back on a resume frame.
//   step 2  move the chosen card, which the `chooseCard` move has already
//           resolved into a real id + zone against live state.
//
// The card is only *reached for* in step 2, which is what makes the two
// re-checks below necessary rather than paranoid: an arbitrary amount of game
// happens between the play and the pick — the whole 无懈可击 chain (these are
// `nullify:'once'`, the trick default), and any trigger it wakes.

import type { CardEffect } from '../effectTypes.js';
import type { EffectCtx, Frame, Zone } from '../../engine/frames.js';
import type { CardId, GState, PlayerId } from '../../engine/state.js';
import { cardChoicesFor, hasChoosableCards } from '../../engine/cardChoice.js';

export interface TakeOneCardOptions {
  key: string;
  /** Where the chosen card goes. Called with the player who played the card:
   * 过河拆桥 discards it; 顺手牵羊 takes it. */
  destination: (source: PlayerId) => Zone;
  /** i18n key for the "which card?" prompt. */
  reasonKey: string;
  /** 顺手牵羊 is distance ≤ 1; 过河拆桥 has no range limit. */
  inRange?: 'distance_1';
}

export function takeOneCardEffect(options: TakeOneCardOptions): CardEffect {
  return {
    key: options.key,

    targeting: {
      min: 1,
      max: 1,
      self: 'forbidden',
      ...(options.inRange ? { inRange: options.inRange } : {}),
      // "A player with no cards at all cannot be targeted" is a targeting rule,
      // not something resolve() discovers — so it lives in the TargetSpec, and
      // validateTargets (bgio/game.ts) enforces it for free, for both cards,
      // like every other targeting rule.
      predicate: (G: GState, _self: PlayerId, candidate: PlayerId) =>
        hasChoosableCards(G, candidate),
    },

    // No rule gates *playing* either card beyond having a legal target, and
    // "is there a legal target" is targeting's job, not canPlay's.
    canPlay: () => true,

    resolve: (G: GState, ctx: EffectCtx): Frame[] => {
      const source = ctx.source as PlayerId;
      const target = (ctx.targets as PlayerId[])[0];
      const victim = G.players[target];

      // Re-check 1: they may have DIED while the nullification chain argued
      // (a 无懈可击 on someone else's 杀 resolving underneath this one, a
      // 闪电 in a judge phase…). The dead-subject rule in pump.ts doesn't
      // cover this: an 'effect' frame's subject is nobody in particular, and
      // the request this pushes is answered by the *source*, who is alive.
      if (!victim?.alive) return [];

      if (!ctx.asked) {
        // Re-check 2: they may have lost their last card in the same window
        // (their only card was itself dismantled). Targeting guaranteed they
        // had one when the card was PLAYED — not that they still do.
        const choices = cardChoicesFor(G, target);
        if (choices.length === 0) return [];

        return [
          {
            t: 'request',
            req: {
              kind: 'chooseCard',
              playerId: source,
              target,
              reasonKey: options.reasonKey,
              choices,
            },
          },
          { t: 'resume', effectKey: options.key, ctx: { ...ctx, asked: true } },
        ];
      }

      // The chooseCard move resolved the slot into a real id + zone against
      // live state before writing it here (engine/cardChoice.ts's resolveSlot).
      // Nothing can have moved the card since: the engine was blocked on
      // G.pending the whole time.
      const chosen = ctx.chosen as CardId | undefined;
      const from = ctx.chosenZone as Zone | undefined;
      if (!chosen || !from) return []; // asked but unanswered — cannot happen; not worth crashing on

      return [{ t: 'moveCards', cards: [chosen], from, to: options.destination(source), by: source }];
    },
  };
}
