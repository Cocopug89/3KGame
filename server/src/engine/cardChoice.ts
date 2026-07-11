// Choosing a card you can't see — docs/judgement-nullification-design.md §5.
//
// 过河拆桥 and 顺手牵羊 make the attacker pick ONE of the target's cards. The
// target's equipment and judgement zone are public, so those can be named by
// card id. Their **hand is not**, and playerView (engine-design §6) bans
// masking: a card id leaks suit and rank by construction, so the server cannot
// send the target's hand ids and let the client pick one.
//
// So the request enumerates SLOTS, not cards. A hand slot is an opaque
// position; the server — here — maps it back to a real id when the answer
// arrives. The client renders N face-down card backs, which is precisely what
// a player sees across a real table.
//
// ⚠️ THE INDEX IS THE SERVER'S OWN ARRAY ORDER (`player.hand`). Never re-sort a
// hand per client, or the same index means two different cards on the two ends
// of the wire.
//
// This is the pattern for every future "pick from a hidden set" (4.4's 大乔 and
// 陆逊 will want it). It lives in engine/ rather than content/ because both
// sides of the round-trip need it: the effect builds the choices, and the
// bgio `chooseCard` move validates the answer against live state.
//
// This module must not import boardgame.io — see docs/engine-design.md §8.

import type { CardId, GState, PlayerId } from './state.js';
import type { Zone } from './frames.js';

/**
 * One thing the attacker may point at. Hand cards are addressed by *index*
 * (opaque); public zones by card id (they are already face up, and naming them
 * leaks nothing).
 *
 * `{z:'revealed'}` (task 3.4, 五谷丰登) reuses this same slot protocol even
 * though it isn't picking from anyone's hidden cards — G.revealed is public —
 * because the underlying need is identical ("offer a set, get back a real id,
 * re-validate against live state"), and the `chooseCard` stage/move already do
 * exactly that generically. There is no `target` player for this variant;
 * `resolveSlot` below ignores the `target` param for it.
 */
export type CardSlot =
  | { z: 'hand'; index: number }
  | { z: 'equip'; cardId: CardId }
  | { z: 'judgementZone'; cardId: CardId }
  | { z: 'revealed'; cardId: CardId };

const EQUIP_SLOTS = ['weapon', 'armour', 'plusHorse', 'minusHorse'] as const;

/**
 * Every card of `target`'s that an attacker may take — hand (by position),
 * equipment (by id) and judgement zone (by id). Both 过河拆桥 and 顺手牵羊 can
 * reach all three zones (plan §3.2).
 */
export function cardChoicesFor(G: GState, target: PlayerId): CardSlot[] {
  const player = G.players[target];
  if (!player) return [];

  const choices: CardSlot[] = [];
  for (let index = 0; index < player.hand.length; index++) {
    choices.push({ z: 'hand', index });
  }
  for (const slot of EQUIP_SLOTS) {
    const cardId = player.equipment[slot];
    if (cardId) choices.push({ z: 'equip', cardId });
  }
  for (const cardId of player.judgementZone) {
    choices.push({ z: 'judgementZone', cardId });
  }
  return choices;
}

/** Has this player anything at all to lose? A player with no cards in any of
 * the three zones is not a legal target for 过河拆桥/顺手牵羊 — this is the
 * `predicate` on both cards' TargetSpec. */
export function hasChoosableCards(G: GState, target: PlayerId): boolean {
  return cardChoicesFor(G, target).length > 0;
}

/**
 * Maps an answer back to a real card, **validating it against live state**.
 * Returns null if the slot doesn't name anything the target actually has — an
 * out-of-bounds hand index, a piece of equipment they aren't wearing — in
 * which case the move returns INVALID_MOVE.
 *
 * Live state *is* the choice list: nothing can move a card while the engine is
 * blocked on `G.pending`, so re-deriving here is equivalent to comparing
 * against the `choices` array that went out with the request, and it can't
 * drift from it.
 */
export function resolveSlot(
  G: GState,
  target: PlayerId,
  slot: CardSlot,
): { cardId: CardId; zone: Zone } | null {
  const player = G.players[target];
  if (!player || !slot || typeof slot !== 'object') return null;

  switch (slot.z) {
    case 'hand': {
      if (!Number.isInteger(slot.index)) return null;
      const cardId = player.hand[slot.index];
      if (cardId === undefined) return null;
      return { cardId, zone: { z: 'hand', player: target } };
    }
    case 'equip': {
      const equipped = EQUIP_SLOTS.some((s) => player.equipment[s] === slot.cardId);
      if (!equipped) return null;
      return { cardId: slot.cardId, zone: { z: 'equip', player: target } };
    }
    case 'judgementZone': {
      if (!player.judgementZone.includes(slot.cardId)) return null;
      return { cardId: slot.cardId, zone: { z: 'judgementZone', player: target } };
    }
    case 'revealed': {
      // The 五谷丰登 pool — public, not per-player. `target` is unused here;
      // callers still pass one (the picker themselves) because `chooseCard`'s
      // PendingRequest shape requires it, but it plays no role in resolving
      // this slot.
      if (!G.revealed.includes(slot.cardId)) return null;
      return { cardId: slot.cardId, zone: { z: 'revealed' } };
    }
    default:
      return null;
  }
}
