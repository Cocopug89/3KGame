// 仁德 (Liu Bei's Benevolence) — in your action phase you may give any
// number of hand cards to another character; once you've given at least two
// cards THIS TURN (across any number of separate uses — 仁德 has no
// per-invocation limit), you recover 1 hp, exactly once.
//
// Modelled as repeatable single-target gifts (`useSkill` may be called again
// — `activeLimit` is left unset, i.e. unlimited) rather than one call giving
// several different players different cards: the generic `useSkill` move's
// (cardIds[], targets[]) shape has no way to pair a card with a DIFFERENT
// recipient per card, and `validateTargets` rejects duplicate target ids
// outright — so "give card A to X and card B to Y" has to be two uses, which
// is also how the paper game is actually played (one gift at a time). The
// running total lives in `G.turnFlags['rende.given']`, written through
// `{t:'flag'}` (the sanctioned turn-state channel); `rende.healed` guards the
// heal so it fires once, on the invocation that crosses the threshold, not
// once per gift (skill-trigger-design §11's correction).

import type { CardEffect } from '../effectTypes.js';
import type { Skill } from '../skillTypes.js';
import type { Frame } from '../../engine/frames.js';
import type { CardId, GState, PlayerId } from '../../engine/state.js';

const rendeActive: CardEffect = {
  key: 'skill.rende',

  targeting: { min: 1, max: 1, self: 'forbidden' },

  canPlay: (G: GState, self: PlayerId) => (G.players[self]?.hand.length ?? 0) > 0,

  resolve: (G, rawCtx) => {
    const ctx = rawCtx as { source: PlayerId; targets: PlayerId[]; cards: CardId[] };
    const source = ctx.source;
    const target = ctx.targets[0];
    const cards = ctx.cards;
    if (cards.length === 0 || !G.players[target]?.alive) return [];

    const givenBefore = (G.turnFlags['rende.given'] as number | undefined) ?? 0;
    const givenAfter = givenBefore + cards.length;
    const alreadyHealed = G.turnFlags['rende.healed'] === true;

    const frames: Frame[] = [
      { t: 'moveCards', cards, from: { z: 'hand', player: source }, to: { z: 'hand', player: target }, by: source },
      { t: 'flag', key: 'rende.given', value: givenAfter },
    ];
    if (!alreadyHealed && givenAfter >= 2) {
      frames.push({ t: 'flag', key: 'rende.healed', value: true });
      frames.push({ t: 'heal', target: source, amount: 1, source });
    }
    return frames;
  },
};

export const rende: Skill = {
  id: 'rende',
  locked: false,
  active: rendeActive,
};
