// The selection state machine behind the prompt (task 6.2): which cards the
// player has picked, which seats they've picked, and whether that adds up to a
// submittable answer. Pure — no React — so every interaction rule below is
// unit-tested rather than discovered by clicking.

import { targetRange } from './prompts.js';
import type { PromptView } from './prompts.js';
import type { CardSlot } from './viewTypes.js';

export interface Selection {
  cards: string[];
  targets: string[];
  /** chooseCard only (过河拆桥/顺手牵羊): the card of *someone else's* you are
   * pointing at. Optional, so the two answer shapes stay disjoint — a prompt is
   * answered with cards (+targets), or with a slot, never both. */
  slot?: CardSlot | null;
}

export const EMPTY_SELECTION: Selection = { cards: [], targets: [], slot: null };

/**
 * Toggling a card off is as important as toggling it on — a misclick during a
 * 濒死 window must be undoable without submitting.
 *
 * When a prompt takes exactly one card (everything except 弃牌), picking a
 * second *replaces* the first rather than being refused: refusing a click is
 * the more annoying of the two behaviours, and there's no ambiguity about what
 * the player meant. Selecting a different card also clears the targets, because
 * they were chosen for a card that is no longer selected (a 杀's target is not
 * a 桃's).
 */
export function toggleCard(selection: Selection, prompt: PromptView, cardId: string): Selection {
  const already = selection.cards.includes(cardId);
  if (already) {
    return { cards: selection.cards.filter((c) => c !== cardId), targets: [] };
  }
  if (prompt.cardCount === 1) {
    return { cards: [cardId], targets: [] };
  }
  // Discard: fill up to the required count, then ignore further picks — the
  // engine wants exactly `count`, and silently dropping the oldest selection
  // would make the discard the player confirms not the one they think they see.
  if (selection.cards.length >= prompt.cardCount) return selection;
  return { cards: [...selection.cards, cardId], targets: [] };
}

/** Point at one of the target's cards, or take your finger off it. Same
 * toggle-off rule as a card: a misclick must be undoable without submitting. */
export function chooseSlot(selection: Selection, slot: CardSlot): Selection {
  return { ...selection, slot: sameSlot(selection.slot, slot) ? null : slot };
}

/** By value, not identity: the server sends fresh slot objects on every
 * snapshot, so `===` would silently never match. */
export function sameSlot(a: CardSlot | null | undefined, b: CardSlot | null | undefined): boolean {
  if (!a || !b || a.z !== b.z) return false;
  if (a.z === 'hand') return b.z === 'hand' && a.index === b.index;
  return 'cardId' in a && 'cardId' in b && a.cardId === b.cardId;
}

export function toggleTarget(
  selection: Selection,
  playerId: string,
  max: number,
): Selection {
  const already = selection.targets.includes(playerId);
  if (already) {
    return { ...selection, targets: selection.targets.filter((t) => t !== playerId) };
  }
  if (max === 1) return { ...selection, targets: [playerId] };
  if (selection.targets.length >= max) return selection;
  return { ...selection, targets: [...selection.targets, playerId] };
}

/**
 * Is the answer complete? This gates the primary button only — the server
 * re-validates everything and is the sole authority on legality (notably range,
 * which the client deliberately does not compute; see prompts.ts's header).
 */
export function canSubmit(
  prompt: PromptView,
  selection: Selection,
  livingOthersCount: number,
): boolean {
  // chooseCard is answered with a slot and nothing else — no hand cards, no
  // seats — and it has no decline path, so this is the only thing that ever
  // unblocks the engine.
  if (prompt.kind === 'chooseCard') return selection.slot != null;

  if (selection.cards.length !== prompt.cardCount) return false;
  if (!prompt.needsTargets) return true;

  const card = selection.cards[0];
  const range = targetRange(card, livingOthersCount);
  if (!range) return false; // unknown/unimplemented card — nothing to submit
  return selection.targets.length >= range.min && selection.targets.length <= range.max;
}

/** The selection is only meaningful for the prompt it was made against; when the
 * engine moves on (a new pending, or a hand that changed underneath us) it must
 * be dropped rather than carried into the next question. */
export function selectionKey(promptKind: string | null, hand: readonly string[]): string {
  return `${promptKind ?? 'none'}:${hand.join(',')}`;
}
