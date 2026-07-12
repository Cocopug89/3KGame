// The selection state machine behind the prompt (task 6.2): which cards the
// player has picked, which seats they've picked, and whether that adds up to a
// submittable answer. Pure — no React — so every interaction rule below is
// unit-tested rather than discovered by clicking.

import { ACTIVE_SKILL_HINTS, targetRange } from './prompts.js';
import type { PromptView } from './prompts.js';
import type { CardSlot } from './viewTypes.js';

export interface Selection {
  cards: string[];
  targets: string[];
  /** chooseCard only (过河拆桥/顺手牵羊): the card of *someone else's* you are
   * pointing at. Optional, so the two answer shapes stay disjoint — a prompt is
   * answered with cards (+targets), or with a slot, never both. */
  slot?: CardSlot | null;

  // ── Batch B / C answers (tasks 4.3, 4.4) ────────────────────────────────
  // All optional: a prompt uses exactly the one field its answer has, and the
  // rest stay untouched. 流离 is the only kind that fills TWO (a card AND a
  // seat) — which is why toggleCard/pickPlayer below preserve the fields they
  // don't own instead of rebuilding the selection from scratch.

  /** chooseOption (刚烈 · 洛神). */
  option?: string | null;
  /** choosePlayer (突袭) and liuliRedirect (流离). Distinct from `targets`, which
   * is an 'act' play's target list and is cleared whenever the card changes. */
  player?: string | null;
  /** declareSuit (反间). */
  suit?: string | null;
  /** guanxing (观星): the offered cards in the order the player wants them back on
   * the pile, index 0 = top. Built by clicking, so a partial order is a normal
   * mid-answer state and canSubmit() waits for all of them. */
  order?: string[];
  /** yijiDistribute (遗计): where each drawn card is going. */
  assignments?: { cardId: string; target: string }[];
  /** 7.2: an ACTIVE skill (制衡/仁德/结姻/离间/反间/青囊/苦肉) being assembled
   * during 'act'. Non-null switches the selection into skill mode: `cards` are
   * the COST, `targets` come from the skill's own hint, and submit fires
   * `useSkill` instead of `playCard`. */
  skill?: string | null;
}

export const EMPTY_SELECTION: Selection = {
  cards: [],
  targets: [],
  slot: null,
  option: null,
  player: null,
  suit: null,
  order: [],
  assignments: [],
  skill: null,
};

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
    return { ...selection, cards: selection.cards.filter((c) => c !== cardId), targets: [] };
  }
  if (prompt.cardCount === 1) {
    return { ...selection, cards: [cardId], targets: [] };
  }
  // Discard: fill up to the required count, then ignore further picks — the
  // engine wants exactly `count`, and silently dropping the oldest selection
  // would make the discard the player confirms not the one they think they see.
  if (selection.cards.length >= prompt.cardCount) return selection;
  return { ...selection, cards: [...selection.cards, cardId], targets: [] };
}

// ── Batch B / C pickers (tasks 4.3, 4.4) ─────────────────────────────────
// Same toggle-off rule as a card, for the same reason: a misclick must be
// undoable without submitting. Each preserves the fields it does not own — 流离
// needs a card AND a seat held at the same time.

/** 7.2: arm (or disarm) an active skill. Cards and targets picked for a card
 * play mean nothing to a skill (and vice versa), so both reset either way. */
export function toggleSkill(selection: Selection, skillId: string): Selection {
  return {
    ...selection,
    skill: selection.skill === skillId ? null : skillId,
    cards: [],
    targets: [],
  };
}

/** Card picking while a skill is armed — a COST, so any card qualifies; the
 * cap is the skill's exact cost (结姻 2, 离间 1) or unbounded (制衡/仁德). */
export function toggleSkillCard(selection: Selection, cardId: string, cap: number): Selection {
  const already = selection.cards.includes(cardId);
  if (already) {
    return { ...selection, cards: selection.cards.filter((c) => c !== cardId) };
  }
  if (selection.cards.length >= cap) {
    // An exact-cost skill replaces the oldest pick rather than refusing the
    // click, same as toggleCard's single-card rule.
    if (cap === 1) return { ...selection, cards: [cardId] };
    return selection;
  }
  return { ...selection, cards: [...selection.cards, cardId] };
}

/** 刚烈 · 洛神. */
export function pickOption(selection: Selection, optionId: string): Selection {
  return { ...selection, option: selection.option === optionId ? null : optionId };
}

/** 突袭 · 流离. */
export function pickPlayer(selection: Selection, playerId: string): Selection {
  return { ...selection, player: selection.player === playerId ? null : playerId };
}

/** 反间. */
export function pickSuit(selection: Selection, suit: string): Selection {
  return { ...selection, suit: selection.suit === suit ? null : suit };
}

/**
 * 观星 — click a card to append it to the order, click it again to pull it back
 * out. Position in `order` IS the answer (index 0 goes on top of the draw pile),
 * so this is a queue the player builds, not a set they tick: re-clicking removes
 * that card and everything keeps its relative order behind it.
 */
export function toggleOrder(selection: Selection, cardId: string): Selection {
  const order = selection.order ?? [];
  return {
    ...selection,
    order: order.includes(cardId) ? order.filter((id) => id !== cardId) : [...order, cardId],
  };
}

/**
 * 遗计 — send one drawn card to one seat. Re-assigning a card MOVES it (a card
 * has exactly one destination, and the engine rejects a set that names one twice)
 * and clicking its current seat again un-assigns it.
 */
export function assignCard(selection: Selection, cardId: string, target: string): Selection {
  const assignments = selection.assignments ?? [];
  const current = assignments.find((a) => a.cardId === cardId);
  const without = assignments.filter((a) => a.cardId !== cardId);
  if (current?.target === target) return { ...selection, assignments: without };
  return { ...selection, assignments: [...without, { cardId, target }] };
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

  // 7.2: an armed active skill answers 'act' through useSkill — complete when
  // its own cost and target shape are, never the selected card's.
  if (prompt.kind === 'act' && selection.skill) {
    const hint = ACTIVE_SKILL_HINTS[selection.skill];
    if (!hint) return false;
    if (hint.cards === 'any') {
      if (selection.cards.length < hint.minCards) return false;
    } else if (selection.cards.length !== hint.cards) {
      return false;
    }
    const max =
      hint.targets.max === 'all_others'
        ? livingOthersCount
        : hint.targets.max === 'all'
          ? livingOthersCount + 1
          : hint.targets.max;
    return selection.targets.length >= hint.targets.min && selection.targets.length <= max;
  }

  // ── Batch B / C (4.3, 4.4). Each answers with its own shape, and each is
  // complete or it is not — there is no partial answer to submit.
  switch (prompt.kind) {
    case 'chooseOption':
      return selection.option != null;
    case 'choosePlayer':
      return selection.player != null;
    case 'declareSuit':
      return selection.suit != null;
    // 观星: the engine wants the WHOLE set back, permuted — a partial order would
    // silently drop cards off the top of the draw pile, so every offered card has
    // to be placed before this enables.
    case 'guanxing':
      return (selection.order?.length ?? 0) === (prompt.cards?.length ?? 0);
    // 遗计: same — every drawn card gets a home, including back to yourself.
    case 'yijiDistribute':
      return (selection.assignments?.length ?? 0) === (prompt.cards?.length ?? 0);
    // 流离 is the one prompt with a two-part answer: the card is the cost, the
    // seat is the effect, and neither alone is a move.
    case 'liuliRedirect':
      return selection.cards.length === 1 && selection.player != null;
    default:
      break;
  }

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
