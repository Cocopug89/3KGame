// 鬼才 (Sima Yi's Ghostly Talent) — before ANY character's judgement card
// takes effect, you may play a hand card to replace it (改判).
//
// Fires on `judge.card`, which per judgement-nullification-design §1.3
// re-fires after every replacement — so a second 鬼才, or a chain with 天妒's
// cousin skills, composes for free through the ordinary trigger fan-out
// (skill-trigger-design §9). This trigger only ASKS (a new `guicaiRetrial`
// request, since the owner is picking from their OWN visible hand — no
// hidden-card slot protocol needed, unlike 3.3's chooseCard); the bgio move
// (server/src/bgio/game.ts) does the discard and pushes the existing
// `{t:'retrial'}` primitive (judgement-nullification-design §1) directly.

import type { Skill } from '../skillTypes.js';

export const guicai: Skill = {
  id: 'guicai',
  locked: false,
  triggers: [
    {
      id: 'skill.guicai',
      event: 'judge.card',
      optional: true,
      labelKey: 'skill.guicai.name',
      when: (e, G, owner) => e.event === 'judge.card' && (G.players[owner]?.hand.length ?? 0) > 0,
      effect: (_e, _G, owner) => [
        { t: 'request', req: { kind: 'guicaiRetrial', playerId: owner, reasonKey: 'skill.guicai' } },
      ],
    },
  ],
};
