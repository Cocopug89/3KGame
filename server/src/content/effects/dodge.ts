// 闪 Dodge. Unlike strike/peach, dodge is never reached through the normal
// {t:'play'} path (the action-phase playCard move) — it is only ever *supplied*
// in answer to a `{t:'demand', kind:'dodge'}` (skill-trigger-design §5). The
// supplyCards move (server/src/bgio/game.ts) is what interprets "the target
// played a 闪": it validates the card through queries.cardsAs, moves it hand →
// discard, and writes it into G.demand.supplied. 闪 itself has no resolution
// step to run.
//
// The registry entry still exists — every card name needs one (task 2.2a's
// effectKey contract), and `dodge` is the *kind* a demand names — so this is a
// documented no-op, not a missing case.
import type { CardEffect } from '../effectTypes.js';

export const dodge: CardEffect = {
  key: 'dodge',

  targeting: {
    min: 0,
    max: 0,
    self: 'only',
  },

  // Whether a player can produce a 闪 is the demand's call ({t:'demandAsk'}
  // folds queries.cardsAs over their hand); there is no separate turn-based
  // rule gating when 闪 may be played the way strikeLimit gates 杀.
  canPlay: () => true,

  resolve: () => [],
};
