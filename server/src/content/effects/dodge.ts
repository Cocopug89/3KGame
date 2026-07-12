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

  // 闪 is PURELY REACTIVE: it answers a {t:'demand', kind:'dodge'} and nothing
  // else. canPlay gates only the proactive action-phase playCard path, and that
  // path must always refuse — this was `() => true` until the first live
  // playtest (7.2) showed a player could burn a 闪 from the action phase for
  // zero effect. The demand path never consults canPlay (supplyCards validates
  // through queries.cardsAs), so answering a 杀 is unaffected.
  canPlay: () => false,

  resolve: () => [],
};
