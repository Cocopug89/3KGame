// The onResult handler for 铁骑's judge (tieji.ts). Dispatched by
// judgeResult (pump.ts) with `{target, judgeCard, sourceCard}` — never played
// directly (canPlay: false), same shape as lightningResult/eightTrigramsResult.
//
// Red ⇒ set the generic `tieji.forceHit` turn flag; content/effects/strike.ts
// reads and clears it at the point its own resume frame is next on the
// stack. This effect never touches the strike itself — it only ever writes
// the flag, which is what keeps it a plain judgement handler instead of a
// second place that knows about strikes.

import type { CardEffect } from '../effectTypes.js';
import type { CardId } from '../../engine/state.js';
import { getCard } from '../../engine/cardIndex.js';

export const tiejiResult: CardEffect = {
  key: 'tieji_result',

  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,

  resolve: (_G, rawCtx) => {
    const judgeCard = (rawCtx as { judgeCard: CardId }).judgeCard;
    const card = getCard(judgeCard);
    const red = card.suit === 'diamonds' || card.suit === 'hearts';
    if (!red) return [];
    return [{ t: 'flag', key: 'tieji.forceHit', value: true }];
  },
};
