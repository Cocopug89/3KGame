// Equipping IS the effect (docs/engine-design.md §3): "Equipment effects are
// not CardEffects. Equipping is the effect (resolve() -> move card to slot,
// discarding whatever it replaces); the weapon's/armour's behaviour is a set
// of triggers registered under the same key." One CardEffect, shared by all
// 13 equipment effectKeys (9 weapons + 2 armour + 2 horse directions) —
// effectRegistry.ts registers it once per key, exactly like `dodge`/`peach`
// are one CardEffect shared by every copy of the card.
//
// Task 3.5's other half of "4 slots, replace-on-equip": that behaviour lives
// in pump.ts's putInZone() (task 3.1/3.2 already built it — "Equipping into
// an occupied slot discards what was there"), not here. This file only has to
// get the card INTO the equip zone.
//
// bgio/game.ts's playCard move runs discardFromHand() for every play, equip
// cards included, before the {t:'play'} frame is even pushed — so by the time
// this resolve() runs, the card is sitting in G.discardPile for one instant.
// {t:'moveCards'} is the one thing allowed to relocate it (a CardEffect may
// never mutate G directly, engine-design §3), and takeFromZone's 'discard'
// case is exactly as general-purpose as its 'hand' case, so lifting the card
// back out is just another zone-to-zone move — no special case needed.

import type { CardEffect } from '../effectTypes.js';
import type { CardId, PlayerId } from '../../engine/state.js';

export const equip: CardEffect = {
  key: 'equip',

  // Equipment cards always target yourself — there is no one else to equip.
  targeting: { min: 0, max: 0, self: 'only' },

  canPlay: () => true,

  resolve: (_G, ctx) => {
    const source = ctx.source as PlayerId;
    const cards = ctx.cards as CardId[];
    const cardId = cards[0];
    return [
      {
        t: 'moveCards',
        cards: [cardId],
        from: { z: 'discard' },
        to: { z: 'equip', player: source },
        by: source,
      },
    ];
  },
};
