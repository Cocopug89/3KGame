// 反馈 (Sima Yi) — after you take damage, you may take one card (hand,
// equipment or judgement zone — your choice) from the damage source. Standard
// text (cross-checked): "当你受到伤害后，你可以获得伤害来源的一张牌。"
//
// The source's HAND is hidden, so this reuses 3.3's slot-based `chooseCard`
// protocol exactly like 顺手牵羊/frost_blade/rock_cleaving_axe do —
// `cardChoicesFor`/`resolveSlot` (engine/cardChoice.ts) — never by naming a
// hand card id directly. `when()` is false when the source has nothing at all
// (skill-trigger-design §3.4).

import type { CardEffect } from '../effectTypes.js';
import type { Skill } from '../skillTypes.js';
import type { Frame, Zone } from '../../engine/frames.js';
import type { CardId, PlayerId } from '../../engine/state.js';
import { cardChoicesFor, hasChoosableCards } from '../../engine/cardChoice.js';

interface FankuiTakeCtx {
  owner: PlayerId;
  source: PlayerId;
  chosen?: CardId;
  chosenZone?: Zone;
}

export const fankuiTake: CardEffect = {
  key: 'fankui_take',
  // Never played, never targeted — an internal continuation (frost_blade_discard
  // is the precedent for this shape).
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,
  resolve: (_G, rawCtx) => {
    const ctx = rawCtx as unknown as FankuiTakeCtx;
    if (!ctx.chosen || !ctx.chosenZone) return [];
    // ⚠️ 5.4 (docs/anti-cheat-audit.md), the audit's one real finding: G.log is
    // PUBLIC — playerView sends it whole to every client — so naming the card
    // here told the entire table which card came out of a hidden hand. At a real
    // table nobody but 司马懿 learns that. A card taken from equipment or the
    // judgement zone was already face up, so that one still names itself.
    const fromHand = ctx.chosenZone.z === 'hand';
    return [
      {
        t: 'moveCards',
        cards: [ctx.chosen],
        from: ctx.chosenZone,
        to: { z: 'hand', player: ctx.owner },
        by: ctx.owner,
      },
      fromHand
        ? { t: 'log', key: 'log.card_taken_hidden', params: { player: ctx.owner, target: ctx.source } }
        : { t: 'log', key: 'log.card_taken', params: { player: ctx.owner, target: ctx.source, card: ctx.chosen } },
    ];
  },
};

export const fankui: Skill = {
  id: 'fankui',
  locked: false,
  triggers: [
    {
      id: 'skill.fankui',
      event: 'damage.after',
      optional: true,
      labelKey: 'skill.fankui.name',
      when: (e, G, owner) =>
        e.event === 'damage.after' && e.target === owner && e.source !== null && hasChoosableCards(G, e.source),
      effect: (e, G, owner): Frame[] => {
        if (e.event !== 'damage.after' || e.source === null) return [];
        const choices = cardChoicesFor(G, e.source);
        if (choices.length === 0) return [];
        return [
          {
            t: 'request',
            req: { kind: 'chooseCard', playerId: owner, target: e.source, reasonKey: 'choose.fankui', choices },
          },
          { t: 'resume', effectKey: 'fankui_take', ctx: { owner, source: e.source } },
        ];
      },
    },
  ],
};
