// What the engine is asking of *this* viewer, as data (task 6.2).
//
// The prompt is derived entirely from `G.pending`, which is the only thing that
// ever blocks the engine: non-null ⇔ someone owes an answer. The kinds are the
// stages in server/src/bgio/game.ts: 'act', 'discard', 'demandCard',
// 'confirmSkill', 'chooseCard' (and 'orderTriggers', which no Standard general
// can reach).
//
// ⚠️ A request kind with NO case below is a stalled table, not a missing
// feature: promptFor() returns null, the player is offered nothing, and the
// engine waits on them forever — silently, because null is also what a
// spectator gets. That has now happened twice (3.2's demandCard, 3.3's
// chooseCard), so interaction.test.ts drives every stage in the shared
// stage/move map through promptFor() and fails if one produces no prompt.
//
// ⚠️ 'respondDodge' and 'respondPeach' ARE GONE (task 4.1b). 杀→闪, 濒死→桃,
// 决斗→杀 and trick→无懈可击 are one thing now — a card DEMAND
// (docs/skill-trigger-design.md §5) — and there is exactly one prompt for all
// of them. Write anything new here generically: the next four cards and half of
// Batch C arrive through this same case, and the demand tells you everything you
// need (which kind of card, how many, and `reasonKey` — an i18n key explaining
// WHY it is being asked for).
//
// ── What this file is deliberately NOT ────────────────────────────────────
// It is not a rules engine. It decides what to *offer*, never what's *legal*:
// the server re-validates every move and answers INVALID_MOVE, and it is the
// only thing entitled to. Two consequences worth understanding before extending
// this:
//
//   • Range is not computed here. Everything needed (seats, who's alive, horses,
//     weapon ranges) is public, so the client *could* re-derive distance — and
//     it must not, because that's engine/distance.ts's job and a second copy
//     would drift the first time a Phase 4 skill touches range. Until the engine
//     puts legal targets in the request (see finding U1 in build-breakdown 6.2),
//     the picker offers every living candidate the TargetSpec shape permits and
//     lets the server refuse.
//   • The playability hints below (杀 limit, 桃 only when wounded) mirror each
//     effect's canPlay(). They exist so the UI can grey a card out instead of
//     firing a move that will bounce. They are hints. If one drifts from the
//     server, the server wins and the player sees a rejection — which is the
//     correct failure mode, and why nothing here is load-bearing.

import { cardById } from './cardIndex.js';
import type {
  CardSlot,
  PromptKind,
  PromptOption,
  SelfPlayerView,
  Suit,
  TableState,
} from './viewTypes.js';
import { SUITS, isSelfPending, isSelfView } from './viewTypes.js';

/** Effects the server can actually resolve today (server/src/content/effectRegistry.ts).
 * Anything else is in the deck but not yet implemented — Phase 3 adds tricks and
 * equipment, Phase 4 skills — so the hand greys it out rather than letting the
 * player fire a move that the registry will reject. Delete entries from the
 * "unimplemented" side by adding them here as each effect lands. */
export const IMPLEMENTED_EFFECT_KEYS: readonly string[] = ['strike', 'dodge', 'peach'];

export function isImplemented(cardId: string): boolean {
  const card = cardById(cardId);
  return card != null && IMPLEMENTED_EFFECT_KEYS.includes(card.effectKey);
}

/** Display-side mirror of each effect's TargetSpec (server/src/content/effects/*.ts).
 * Only the shape the picker needs — `predicate` is a function and `inRange`
 * needs the engine, so neither crosses the wire; see the header. */
export interface TargetHint {
  min: number;
  max: number | 'all_others' | 'all';
  self: 'allowed' | 'forbidden' | 'only';
}

/** A demand names a *kind*, which is an effectKey ('dodge' · 'peach' · 'strike'
 * · 'nullification'). The title is per-kind where we have one, and a generic
 * fallback otherwise — a new demand kind must never render a blank prompt. */
const DEMAND_TITLE_KEYS: Record<string, string> = {
  dodge: 'prompt.respond_dodge',
  peach: 'prompt.respond_peach',
  strike: 'prompt.demand_strike',
  nullification: 'prompt.demand_nullification',
};

const DEMAND_DECLINE_KEYS: Record<string, string> = {
  dodge: 'prompt.take_damage',
  peach: 'prompt.decline_peach',
};

const TARGET_HINTS: Record<string, TargetHint> = {
  strike: { min: 1, max: 1, self: 'forbidden' },
  peach: { min: 0, max: 0, self: 'only' }, // played on yourself; no seat to pick
  dodge: { min: 0, max: 0, self: 'only' },
};

export function targetHint(cardId: string): TargetHint | null {
  const card = cardById(cardId);
  return card ? (TARGET_HINTS[card.effectKey] ?? null) : null;
}

/** How many seats this card wants, resolved against the current table. */
export function targetRange(
  cardId: string,
  livingOthers: number,
): { min: number; max: number } | null {
  const hint = targetHint(cardId);
  if (!hint) return null;
  const max =
    hint.max === 'all_others'
      ? livingOthers
      : hint.max === 'all'
        ? livingOthers + 1
        : hint.max;
  return { min: hint.min, max };
}

export interface PromptView {
  kind: PromptKind;
  /** Headline: what you're being asked. */
  titleKey: string;
  /** Which hand cards this prompt can be answered with. Null = any card. */
  allowedEffectKeys: readonly string[] | null;
  /** Cards that must be selected before the primary button enables. Zero for a
   * prompt that isn't answered with hand cards at all (confirmSkill, chooseCard). */
  cardCount: number;
  /** Only 'act' picks seats — a response answers a card that already has a target. */
  needsTargets: boolean;
  primaryKey: string;
  /** The out: pass your turn, or decline to answer. Discard and chooseCard have
   * neither — the engine will not move on until they are answered. */
  secondary: 'pass' | 'decline' | null;
  secondaryKey: string | null;
  /** chooseCard only: exactly the slots the server offered. Never re-derived —
   * the client is not entitled to know what is in the victim's hand. */
  choices?: readonly CardSlot[];
  /** chooseCard only: whose cards you are pointing at. */
  choiceTarget?: string;
  /** chooseCard and the Batch B/C kinds: the engine's own explanation
   * ('choose.dismantle', 'choose.ganglie'), which may take {{player}}. Demands
   * carry theirs on `G.pending` instead (see demandReasonKey) — this one rides on
   * the prompt because it is also the TITLE, when it resolves. Guarded with
   * i18n.exists() at the render site: an engine reasonKey can land before its
   * string does, and a raw key is not a question. */
  reasonKey?: string;
  /** chooseOption only (刚烈 · 洛神): the labelled list the engine offered. */
  options?: readonly PromptOption[];
  /** choosePlayer (突袭) and liuliRedirect (流离): the seats the ENGINE says are
   * legal. Note this is the OPPOSITE of how 'act' picks targets — there the
   * client offers every living seat and lets the server refuse, because range is
   * engine/distance.ts's business and a second copy would drift (see the header).
   * Here the engine has ALREADY done that filtering and shipped the result, so
   * the picker offers exactly these and invents nothing. */
  candidates?: readonly string[];
  /** guanxing (观星) and yijiDistribute (遗计): cards the engine is showing YOU and
   * nobody else — a private reveal on the request itself (skill-trigger-design
   * §6), which is why they arrive as ids rather than as a count. */
  cards?: readonly string[];
  /** declareSuit only (反间). */
  suits?: readonly Suit[];
}

/**
 * The prompt for this viewer, or null when the engine isn't waiting on them.
 *
 * Note it returns null for *onlookers* too: an onlooker's view of `pending` is
 * `{kind, waitingOn}` with no `playerId`, which is exactly the information they
 * are allowed to have — the board shows them "waiting on X" and no buttons.
 */
export function promptFor(state: TableState, viewerId: string | null): PromptView | null {
  const pending = state.pending;
  if (viewerId == null || !isSelfPending(pending) || pending.playerId !== viewerId) return null;

  switch (pending.kind) {
    case 'act':
      return {
        kind: 'act',
        titleKey: 'prompt.act',
        allowedEffectKeys: null,
        cardCount: 1,
        needsTargets: true,
        primaryKey: 'ui.play_card',
        secondary: 'pass',
        secondaryKey: 'prompt.end_action',
      };
    // ONE case for every card the engine can ask you for (4.1b). The engine
    // never raises a demand it believes you cannot answer, so an empty
    // `allowedEffectKeys` intersection here means the *server* knows something
    // the client doesn't — a 视为 skill (武圣/龙胆/急救) widening what counts.
    // Which is why this offers the demanded kind and lets the server refuse,
    // exactly like target range: no rules in the client.
    case 'demandCard': {
      const demandKind = typeof pending.demandKind === 'string' ? pending.demandKind : '';
      const count = typeof pending.count === 'number' ? pending.count : 1;
      return {
        kind: 'demandCard',
        titleKey: DEMAND_TITLE_KEYS[demandKind] ?? 'prompt.demand',
        allowedEffectKeys: [demandKind],
        cardCount: count, // 无双 asks for two 闪
        needsTargets: false,
        primaryKey: 'ui.confirm',
        secondary: 'decline',
        secondaryKey: DEMAND_DECLINE_KEYS[demandKind] ?? 'prompt.demand_decline',
      };
    }
    // An optional trigger's yes/no (§3.4). No cards, no targets — just a
    // question with the skill's own name on it.
    case 'confirmSkill':
      return {
        kind: 'confirmSkill',
        titleKey: 'prompt.confirm_skill',
        allowedEffectKeys: [],
        cardCount: 0,
        needsTargets: false,
        primaryKey: 'prompt.use_skill',
        secondary: 'decline',
        secondaryKey: 'prompt.decline_skill',
      };
    // "Point at one of that player's cards" — 过河拆桥/顺手牵羊 (task 3.3). The
    // ONE request that is not answered with a card of your own: the answer is a
    // slot in `choices`, so cardCount is 0 and the hand is inert. No decline
    // either — the card is already resolving and the engine will not move on.
    case 'chooseCard': {
      const choices = Array.isArray(pending.choices) ? (pending.choices as CardSlot[]) : [];
      return {
        kind: 'chooseCard',
        titleKey: 'prompt.choose_card',
        allowedEffectKeys: [],
        cardCount: 0,
        needsTargets: false,
        primaryKey: 'ui.confirm',
        secondary: null,
        secondaryKey: null,
        choices,
        ...(typeof pending.target === 'string' ? { choiceTarget: pending.target } : {}),
        ...(typeof pending.reasonKey === 'string' ? { reasonKey: pending.reasonKey } : {}),
      };
    }
    case 'discard': {
      const count = typeof pending.count === 'number' ? pending.count : 0;
      return {
        kind: 'discard',
        titleKey: 'prompt.discard',
        allowedEffectKeys: null,
        cardCount: count,
        needsTargets: false,
        primaryKey: 'ui.confirm',
        secondary: null,
        secondaryKey: null,
      };
    }

    // ── Batch B / C (tasks 4.3, 4.4) ──────────────────────────────────────
    //
    // Seven request kinds the engine has been able to raise since Phase 4 and
    // this file had no case for — so promptFor() returned null, the player was
    // offered nothing, and the table stalled on whoever was asked. That is the
    // third time the same gap has opened (3.2's demandCard, 3.3's chooseCard),
    // and it is why the tripwire in interaction.test.ts now drives EVERY stage in
    // the shared stage/move map through this function.
    //
    // Each reads only what its own request carries and invents nothing: the
    // options, the candidate seats and the revealed cards are all the engine's,
    // shipped on `G.pending`. Missing/!Array payloads fall back to empty rather
    // than throwing — a prompt with nothing in it is a visible dead end the
    // player can report, and a crashed board is not.

    // 刚烈 (the damage source picks: discard two, or take 1 damage) · 洛神 (keep
    // the black judgement card and judge again, or stop). The engine ships both
    // the option ids and their i18n keys.
    case 'chooseOption': {
      const options = Array.isArray(pending.options) ? (pending.options as PromptOption[]) : [];
      return {
        kind: 'chooseOption',
        titleKey: 'prompt.choose_option',
        allowedEffectKeys: [], // answered by picking an option, not a card
        cardCount: 0,
        needsTargets: false,
        primaryKey: 'ui.confirm',
        secondary: null, // one of the options IS the answer space; there is no third door
        secondaryKey: null,
        options,
        ...(typeof pending.reasonKey === 'string' ? { reasonKey: pending.reasonKey } : {}),
      };
    }

    // 突袭 — a seat, not a card. Declining is a REAL answer, not a refusal: 突袭
    // takes a card from *up to* two players, so "stop" is the skill working as
    // written (server/src/content/skills/tuxi.ts, and bgio/game.ts's choosePlayer
    // explicitly accepts null).
    case 'choosePlayer': {
      const candidates = Array.isArray(pending.candidates) ? (pending.candidates as string[]) : [];
      return {
        kind: 'choosePlayer',
        titleKey: 'prompt.choose_player',
        allowedEffectKeys: [],
        cardCount: 0,
        needsTargets: false,
        primaryKey: 'ui.confirm',
        secondary: 'decline',
        secondaryKey: 'prompt.choose_player_stop',
        candidates,
        ...(typeof pending.reasonKey === 'string' ? { reasonKey: pending.reasonKey } : {}),
      };
    }

    // 反间 — the TARGET names a suit before 周瑜 reveals one of his hand cards.
    // The guess is blind, and that IS the skill: no hint is offered here, and the
    // client has nothing to base one on anyway (周瑜's hand is not in this view).
    case 'declareSuit':
      return {
        kind: 'declareSuit',
        titleKey: 'prompt.declare_suit',
        allowedEffectKeys: [],
        cardCount: 0,
        needsTargets: false,
        primaryKey: 'ui.confirm',
        secondary: null,
        secondaryKey: null,
        suits: SUITS,
        ...(typeof pending.reasonKey === 'string' ? { reasonKey: pending.reasonKey } : {}),
      };

    // 观星 — the top N cards of the draw pile, private to 诸葛亮 (§6). The answer
    // is the whole set, re-ordered; index 0 goes back on top. The server's move
    // re-inserts the full permutation and nothing else, so the client offers
    // ordering and nothing else — notably NOT the "bottom of the pile" half of
    // the printed skill, which the engine does not implement and the client must
    // therefore not pretend to.
    case 'guanxing': {
      const cards = Array.isArray(pending.cards) ? (pending.cards as string[]) : [];
      return {
        kind: 'guanxing',
        titleKey: 'prompt.guanxing',
        allowedEffectKeys: [],
        cardCount: 0,
        needsTargets: false,
        primaryKey: 'ui.confirm',
        secondary: null,
        secondaryKey: null,
        cards,
      };
    }

    // 鬼才 — replace an in-flight judgement card with one of your OWN hand cards.
    // Any card: the rule is about the card's suit/rank once it lands, never about
    // what it *is*, so this is a cost like a discard and the hand is fully
    // selectable (see cardBlock's CARD_IS_A_COST). Declining is free even though
    // the optional trigger already said yes (bgio/game.ts's submitRetrial takes
    // null).
    case 'guicaiRetrial':
      return {
        kind: 'guicaiRetrial',
        titleKey: 'prompt.guicai',
        allowedEffectKeys: null, // any hand card
        cardCount: 1,
        needsTargets: false,
        primaryKey: 'ui.confirm',
        secondary: 'decline',
        secondaryKey: 'prompt.decline_retrial',
      };

    // 遗计 — the two cards 郭嘉 just drew, handed out one seat at a time. They are
    // already IN his hand (the engine drew them first), so this is not a hand
    // selection: it is an assignment of each named card to a living seat, and
    // every one of them must be placed — including, legally, back to himself.
    case 'yijiDistribute': {
      const cards = Array.isArray(pending.cards) ? (pending.cards as string[]) : [];
      return {
        kind: 'yijiDistribute',
        titleKey: 'prompt.yiji',
        allowedEffectKeys: [],
        cardCount: 0,
        needsTargets: false,
        primaryKey: 'ui.confirm',
        secondary: null,
        secondaryKey: null,
        cards,
      };
    }

    // 流离 — discard a card to push the 杀 onto someone else in YOUR attack range.
    // Two answers in one: the card (a cost — any card) and the seat. The seats are
    // the engine's own list (it range-checked them, and excluded the 杀's user);
    // the client does not re-derive range. No decline: the optional trigger's
    // confirmSkill was the decline, and the move takes both arguments.
    case 'liuliRedirect': {
      const candidates = Array.isArray(pending.candidates) ? (pending.candidates as string[]) : [];
      return {
        kind: 'liuliRedirect',
        titleKey: 'prompt.liuli',
        allowedEffectKeys: null, // any hand card — the discard is a cost
        cardCount: 1,
        needsTargets: false, // the seat comes from `candidates`, not from targetHint()
        primaryKey: 'ui.confirm',
        secondary: null,
        secondaryKey: null,
        candidates,
      };
    }

    default:
      return null;
  }
}

/** Who the demand is *about*, when that isn't the person being asked: the dying
 * player a 桃 is wanted for (anyone may save them, in seat order), or the player
 * whose 杀 you are being asked to dodge. Without it, a player asked to spend
 * their own 桃 on a stranger cannot tell why. */
export function demandSubject(state: TableState): string | null {
  const pending = state.pending;
  if (!isSelfPending(pending) || pending.kind !== 'demandCard') return null;
  return typeof pending.subject === 'string' ? pending.subject : null;
}

/** The demanded card kind ('dodge' · 'peach' · …), for the prompt's copy. */
export function demandKind(state: TableState): string | null {
  const pending = state.pending;
  if (!isSelfPending(pending) || pending.kind !== 'demandCard') return null;
  return typeof pending.demandKind === 'string' ? pending.demandKind : null;
}

/** The i18n key explaining WHY a card is being demanded ('judge.lightning',
 * 'nullify.indulgence'…). Not every reasonKey has a locale entry yet, so the
 * caller must guard with i18n.exists(). */
export function demandReasonKey(state: TableState): string | null {
  const pending = state.pending;
  if (!isSelfPending(pending) || pending.kind !== 'demandCard') return null;
  return typeof pending.reasonKey === 'string' ? pending.reasonKey : null;
}

/** Prompts whose hand card is a COST rather than a play: it leaves your hand to
 * pay for something, and nothing about the card itself has to be legal. */
const CARD_IS_A_COST: readonly PromptKind[] = ['discard', 'guicaiRetrial', 'liuliRedirect'];

/** Can this hand card be selected for this prompt? Returns the reason it can't,
 * so the UI can explain itself rather than just greying out silently. */
export type CardBlock =
  | 'wrong_card'
  | 'not_implemented'
  | 'strike_limit'
  | 'not_wounded'
  | 'choose_instead'
  | null;

export function cardBlock(
  state: TableState,
  viewer: SelfPlayerView,
  prompt: PromptView,
  cardId: string,
): CardBlock {
  const card = cardById(cardId);
  if (!card) return 'not_implemented';

  // 过河拆桥/顺手牵羊 are answered by pointing at the TARGET's cards. Say that,
  // rather than telling a player their perfectly good 杀 "can't answer this
  // request" while the real answer sits in another panel on the same screen.
  if (prompt.kind === 'chooseCard') return 'choose_instead';

  if (prompt.allowedEffectKeys && !prompt.allowedEffectKeys.includes(card.effectKey)) {
    return 'wrong_card';
  }
  // A card spent as a COST is never *played*, so what it would have done is
  // irrelevant: an unimplemented trick discards perfectly well, replaces a
  // judgement card perfectly well (鬼才 cares about the card's suit and rank once
  // it lands, never about what it is), and pays for 流离 perfectly well. The
  // implementation gate only applies to actually PLAYING a card.
  if (CARD_IS_A_COST.includes(prompt.kind)) return null;
  if (!IMPLEMENTED_EFFECT_KEYS.includes(card.effectKey)) return 'not_implemented';

  if (prompt.kind === 'act') {
    if (card.effectKey === 'strike' && state.turnFlags.strikesPlayed >= state.turnFlags.strikeLimit) {
      return 'strike_limit';
    }
    if (card.effectKey === 'peach' && viewer.hp >= viewer.maxHp) return 'not_wounded';
  }
  return null;
}

export const CARD_BLOCK_I18N_KEY: Record<Exclude<CardBlock, null>, string> = {
  wrong_card: 'prompt.blocked_wrong_card',
  not_implemented: 'prompt.blocked_not_implemented',
  strike_limit: 'prompt.blocked_strike_limit',
  not_wounded: 'prompt.blocked_not_wounded',
  choose_instead: 'prompt.blocked_choose_instead',
};

/** Seats the picker will offer for a selected card. Legality (range!) is the
 * server's call — see the header. */
export function candidateTargets(
  state: TableState,
  viewerId: string,
  cardId: string,
): string[] {
  const hint = targetHint(cardId);
  if (!hint || hint.max === 0) return [];
  return state.seats.filter((id) => {
    const player = state.players[id];
    if (!player?.alive) return false;
    if (id === viewerId) return hint.self !== 'forbidden';
    return hint.self !== 'only';
  });
}

export function livingOthers(state: TableState, viewerId: string): number {
  return state.seats.filter((id) => id !== viewerId && state.players[id]?.alive).length;
}

export function viewerOf(state: TableState, viewerId: string | null): SelfPlayerView | null {
  if (viewerId == null) return null;
  const player = state.players[viewerId];
  return player && isSelfView(player) ? player : null;
}
