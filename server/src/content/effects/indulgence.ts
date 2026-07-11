// 乐不思蜀 Indulgence — a DELAYED trick (plan §3.2/3.4, judgement-
// nullification-design §3). Two effects live here:
//
//   `indulgence`         — the PLAY-time effect: places the card into the
//                           target's judgement zone. `nullify: 'none'` is
//                           load-bearing (see below), not the trick default.
//   `indulgenceResult`   — the JUDGE-time `onResult` handler phases.ts
//                           dispatches when the card's judgement resolves.
//
// ⚠️ THE TIMING TRAP (design doc §3, quoted because it is exactly the bug a
// naive implementation ships): "the 无懈可击 window that matters opens at the
// start of the victim's judge phase, before the judgement card is flipped —
// not when the card is played." pump.ts's 'play' case defaults every
// `type:'trick'` card to `nullify:'once'` UNLESS the effect says otherwise —
// so a delayed trick that left `nullify` unset would get a SECOND, WRONG
// window at play time on top of the real one phases.ts already wraps around
// its `{t:'judge'}` frame. Setting `nullify:'none'` here suppresses that
// spurious window; the only window this card ever gets is the judge-phase
// one, keyed by the exact same `nullify.indulgence` locale string either way.
//
// The card physically leaves the player's hand into G.discardPile via the
// generic playCard move (like every other card) BEFORE this resolve() ever
// runs — so relocating it into the target's judgement zone is a `moveCards`
// FROM discard, not from hand.

import type { CardEffect } from '../effectTypes.js';
import type { Frame } from '../../engine/frames.js';
import type { CardId, GState, PlayerId } from '../../engine/state.js';
import { getCard } from '../../engine/cardIndex.js';

/** No two delayed tricks of the same name in one judgement zone (design §3).
 * Shared by indulgence.ts and lightning.ts. */
export function alreadyHasDelayedTrick(G: GState, target: PlayerId, effectKey: string): boolean {
  return G.players[target]?.judgementZone.some((id) => getCard(id).effectKey === effectKey) ?? false;
}

export const indulgence: CardEffect = {
  key: 'indulgence',

  targeting: {
    min: 1,
    max: 1,
    self: 'forbidden', // targets "another living player", no range limit
    predicate: (G, _self, candidate) => !alreadyHasDelayedTrick(G, candidate, 'indulgence'),
  },

  // See the file header — this is NOT the trick default, and the override is
  // the whole point.
  nullify: 'none',

  canPlay: () => true,

  resolve: (_G, ctx) => {
    const source = ctx.source as PlayerId;
    const target = (ctx.targets as PlayerId[])[0];
    const card = (ctx.cards as CardId[])[0];
    return [
      {
        t: 'moveCards',
        cards: [card],
        from: { z: 'discard' },
        to: { z: 'judgementZone', player: target },
        by: source,
      },
    ];
  },
};

export const indulgenceResult: CardEffect = {
  key: 'indulgence_result',

  // Internal — dispatched only via {t:'judgeResult'}'s onResult, never played.
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,

  resolve: (_G, ctx) => {
    const target = ctx.target as PlayerId;
    const judgeCard = ctx.judgeCard as CardId;
    const sourceCard = ctx.sourceCard as CardId | undefined;
    const suit = getCard(judgeCard).suit;

    const frames: Frame[] = [
      { t: 'log', key: 'log.judgement', params: { player: target, card: judgeCard } },
    ];
    // Consumed either way: the 乐不思蜀 card itself leaves the judgement zone
    // once its judgement has been read.
    if (sourceCard) {
      frames.push({
        t: 'moveCards',
        cards: [sourceCard],
        from: { z: 'judgementZone', player: target },
        to: { z: 'discard' },
      });
    }
    if (suit !== 'hearts') {
      frames.push({ t: 'skipPhase', phase: 'action' });
    }
    return frames;
  },
};
