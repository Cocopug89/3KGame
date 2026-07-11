// 闪电 Lightning — the other DELAYED trick (plan §3.2/3.4, judgement-
// nullification-design §2.4/§3). Three effects live here:
//
//   `lightning`         — play-time: self-target only, places the card into
//                          the PLAYER'S OWN judgement zone. `nullify: 'none'`
//                          for the exact reason indulgence.ts's header
//                          explains — the real window is the judge-phase one
//                          phases.ts already builds, not a second one here.
//   `lightningResult`    — judge-time `onResult`: ♠2-9 hits for 3 thunder
//                          damage and discards the card; anything else, the
//                          card travels on.
//   `lightningPass`      — moves the card to the next eligible living player,
//                          clockwise, skipping anyone who already has one.
//                          Reused both by a MISSED judgement (via
//                          lightningResult) and by a NULLIFIED judgement
//                          (phases.ts's delayedTrickOnNullified calls this
//                          same effectKey directly — design §2.4's
//                          "a nullified 闪电 is NOT discarded, it travels on").
//                          If nobody is eligible, the card stays exactly
//                          where it is — same rule as a full circle of
//                          existing holders.
//
// `source: null` on the damage frame is deliberate (design §3): 闪电 has no
// killer, so Phase 5's kill reward/penalty never fires for it.

import type { CardEffect } from '../effectTypes.js';
import type { Frame } from '../../engine/frames.js';
import type { CardId, GState, PlayerId } from '../../engine/state.js';
import { getCard } from '../../engine/cardIndex.js';
import { alreadyHasDelayedTrick } from './indulgence.js';

const HIT_RANKS = new Set(['2', '3', '4', '5', '6', '7', '8', '9']);

export const lightning: CardEffect = {
  key: 'lightning',

  targeting: { min: 0, max: 0, self: 'only' },

  nullify: 'none', // see the file header — the real window is at judge time

  canPlay: (G, self) => !alreadyHasDelayedTrick(G, self, 'lightning'),

  resolve: (_G, ctx) => {
    const source = ctx.source as PlayerId;
    const card = (ctx.cards as CardId[])[0];
    return [
      {
        t: 'moveCards',
        cards: [card],
        from: { z: 'discard' },
        to: { z: 'judgementZone', player: source },
        by: source,
      },
    ];
  },
};

export const lightningResult: CardEffect = {
  key: 'lightning_result',

  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,

  resolve: (_G, ctx) => {
    const target = ctx.target as PlayerId;
    const judgeCard = ctx.judgeCard as CardId;
    const sourceCard = ctx.sourceCard as CardId | undefined;
    const card = getCard(judgeCard);
    const hit = card.suit === 'spades' && HIT_RANKS.has(card.rank);

    const frames: Frame[] = [
      { t: 'log', key: 'log.judgement', params: { player: target, card: judgeCard } },
    ];

    if (hit) {
      frames.push({ t: 'damage', source: null, target, amount: 3, kind: 'thunder' });
      frames.push({ t: 'log', key: 'log.damage', params: { target, n: 3, source: null } });
      if (sourceCard) {
        frames.push({
          t: 'moveCards',
          cards: [sourceCard],
          from: { z: 'judgementZone', player: target },
          to: { z: 'discard' },
        });
      }
      return frames;
    }

    frames.push({ t: 'effect', effectKey: 'lightning_pass', ctx: { owner: target, card: sourceCard } });
    return frames;
  },
};

export const lightningPass: CardEffect = {
  key: 'lightning_pass',

  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,

  resolve: (G: GState, ctx) => {
    const owner = ctx.owner as PlayerId;
    const card = ctx.card as CardId | undefined;
    if (!card) return [];

    const seatOfOwner = G.players[owner]?.seat;
    if (seatOfOwner === undefined) return [];
    const n = G.seats.length;

    for (let step = 1; step <= n; step++) {
      const seat = (seatOfOwner + step) % n;
      const candidateId = G.seats[seat];
      if (candidateId === owner) break; // wrapped all the way around — stays put
      const candidate = G.players[candidateId];
      if (!candidate?.alive) continue;
      if (alreadyHasDelayedTrick(G, candidateId, 'lightning')) continue; // skip an existing holder

      return [
        {
          t: 'moveCards',
          cards: [card],
          from: { z: 'judgementZone', player: owner },
          to: { z: 'judgementZone', player: candidateId },
        },
      ];
    }
    return []; // nobody eligible — the card stays exactly where it is
  },
};
