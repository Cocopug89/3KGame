// 反间 (Zhou Yu's Sow Discord) — once per action phase: the target names a
// suit, then you GIVE them one of YOUR OWN hand cards, revealed; if its suit
// doesn't match their guess, you deal 1 damage to them. (Direction confirmed
// against the locale, which is the authoritative 4.1a cross-check per
// skill-trigger-design §11: zh "该角色获得你的一张手牌", en "another character
// ... takes one of your hand cards" — 周瑜 hands over his own card, he does
// NOT steal one from the target. §8's terse gloss reads ambiguously either
// way; the locale settles it.)
//
// Two sequential asks, so this is an ordinary multi-call CardEffect (like
// harvest.ts/takeOneCard.ts): a new `declareSuit` request for the target's
// guess, then the EXISTING slot-based `chooseCard` protocol
// (judgement-nullification-design §5) for 周瑜's pick from HIS OWN hand
// (addressed by index, `target: source`) — reused exactly as 3.3's
// 大乔/陆逊-shaped cards do, per skill-trigger-design §8's own note.

import type { CardEffect } from '../effectTypes.js';
import type { Skill } from '../skillTypes.js';
import type { CardId, PlayerId } from '../../engine/state.js';
import type { Frame, Zone } from '../../engine/frames.js';
import { cardChoicesFor } from '../../engine/cardChoice.js';
import { getCard } from '../../engine/cardIndex.js';

const fanjianActive: CardEffect = {
  key: 'skill.fanjian',

  targeting: {
    min: 1,
    max: 1,
    self: 'forbidden',
    // The target's own hand is irrelevant — 反间 gives them a card, it does
    // not take one — so any other living character is a legal target.
  },

  // The cost is a card in 周瑜's OWN hand (the one he gives away), not the
  // target's. No hand card ⇒ nothing to hand over ⇒ can't use.
  canPlay: (G, self) => (G.players[self]?.hand.length ?? 0) > 0,

  resolve: (G, rawCtx) => {
    const ctx = rawCtx as {
      source: PlayerId;
      targets: PlayerId[];
      cards: CardId[];
      declaredSuit?: string;
      asked?: boolean;
      chosen?: CardId;
      chosenZone?: Zone;
    };
    const source = ctx.source;
    const target = ctx.targets[0];
    if (!G.players[target]?.alive) return [];

    if (!ctx.declaredSuit) {
      return [
        { t: 'request', req: { kind: 'declareSuit', playerId: target, reasonKey: 'skill.fanjian' } },
        { t: 'resume', effectKey: 'skill.fanjian', ctx: { ...ctx } },
      ];
    }

    if (!ctx.asked) {
      // 周瑜 picks one of his OWN hand cards to hand over. He may look at his
      // own hand and deliberately choose an off-suit card to guarantee the
      // damage — that IS the skill. The slot protocol addresses it by index
      // against the SOURCE's hand (`target: source`).
      const choices = cardChoicesFor(G, source).filter((c) => c.z === 'hand');
      if (choices.length === 0) return [];
      return [
        {
          t: 'request',
          req: { kind: 'chooseCard', playerId: source, target: source, reasonKey: 'skill.fanjian', choices },
        },
        { t: 'resume', effectKey: 'skill.fanjian', ctx: { ...ctx, asked: true } },
      ];
    }

    const chosen = ctx.chosen;
    const from = ctx.chosenZone;
    if (!chosen || !from) return [];

    const card = getCard(chosen);
    const frames: Frame[] = [
      // The chosen card leaves 周瑜's hand and is GIVEN to the target, revealed.
      { t: 'moveCards', cards: [chosen], from, to: { z: 'hand', player: target }, by: source },
      // 'log.card_taken' is "{{player}} takes {{card}} from {{target}}" — read
      // from the RECIPIENT's side (they take it FROM the giver), which is the
      // opposite pairing of every other user of this key (they read as the
      // taker). `player`/`target` swapped accordingly, not just renamed.
      { t: 'log', key: 'log.card_taken', params: { player: target, card: chosen, target: source } },
    ];
    if (card.suit !== ctx.declaredSuit) {
      frames.push(
        { t: 'damage', source, target, amount: 1, kind: 'normal' },
        { t: 'log', key: 'log.damage', params: { target, n: 1, source } },
      );
    }
    return frames;
  },
};

export const fanjian: Skill = {
  id: 'fanjian',
  locked: false,
  active: fanjianActive,
  activeLimit: 'once_per_turn',
};
