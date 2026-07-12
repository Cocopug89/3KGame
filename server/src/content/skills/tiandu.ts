// 天妒 (Guo Jia's Envy of Heaven) — after YOUR OWN judgement card takes
// effect, you may take it into your hand.
//
// judgeResult (pump.ts) pushes the discarded card onto G.discardPile BEFORE
// emitting `judge.result` — so by the time this trigger fires, the card is
// the top of the (public) discard pile. Reading it there, rather than off
// the event payload (which carries no card id — skill-trigger-design §2's
// table), is safe precisely because nothing else can have discarded anything
// else in between: this trigger fires synchronously, as the very next thing
// after judgeResult's own push.

import type { Skill } from '../skillTypes.js';

export const tiandu: Skill = {
  id: 'tiandu',
  locked: false,
  triggers: [
    {
      id: 'skill.tiandu',
      event: 'judge.result',
      optional: true,
      labelKey: 'skill.tiandu.name',
      when: (e, G, owner) =>
        e.event === 'judge.result' && e.target === owner && G.discardPile.length > 0,
      effect: (_e, G, owner) => {
        const cardId = G.discardPile[G.discardPile.length - 1];
        return [
          { t: 'moveCards', cards: [cardId], from: { z: 'discard' }, to: { z: 'hand', player: owner }, by: owner },
        ];
      },
    },
  ],
};
