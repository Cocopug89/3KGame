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

import { cardById, generalById } from './cardIndex.js';
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
 * As of Phase 3/4 that is the ENTIRE standard deck — every trick and all 13
 * equipment effectKeys resolve server-side. This list must mirror the registry's
 * player-playable keys: the first live playtest (7.2) found it still frozen at
 * the Phase 2 basics, which greyed out every trick and equipment card in the
 * deployed client while the bots (which bypass the UI) played them fine.
 * `nullification` is listed because it must be SUPPLIABLE to a demand — playing
 * it proactively in the action phase is blocked in cardBlock() below instead. */
export const IMPLEMENTED_EFFECT_KEYS: readonly string[] = [
  // basics
  'strike', 'dodge', 'peach',
  // tricks (task 3.3/3.4)
  'nullification', 'dismantle', 'steal', 'draw_two', 'duel',
  'barbarian_invasion', 'raining_arrows', 'peach_garden', 'duress',
  'indulgence', 'lightning', 'harvest',
  // equipment (task 3.5/3.6) — one shared server effect, 13 effectKeys
  'zhuge_crossbow', 'gender_swords', 'blue_steel_sword', 'frost_blade',
  'rock_cleaving_axe', 'green_dragon_blade', 'serpent_spear', 'heaven_scorcher',
  'unicorn_bow', 'eight_trigrams', 'renwang_shield', 'plus_horse', 'minus_horse',
];

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

const NO_TARGET: TargetHint = { min: 0, max: 0, self: 'only' };
const ONE_OTHER: TargetHint = { min: 1, max: 1, self: 'forbidden' };

const TARGET_HINTS: Record<string, TargetHint> = {
  // basics
  strike: ONE_OTHER,
  peach: NO_TARGET, // played on yourself; no seat to pick
  dodge: NO_TARGET,
  // tricks — mirrored 1:1 from each effect's TargetSpec in
  // server/src/content/effects/*.ts (predicate/inRange stay server-side;
  // see the header — the server refuses what the picker over-offers).
  nullification: NO_TARGET,
  dismantle: ONE_OTHER,
  steal: ONE_OTHER,
  draw_two: NO_TARGET,
  duel: ONE_OTHER,
  barbarian_invasion: { min: 1, max: 'all_others', self: 'forbidden' },
  raining_arrows: { min: 1, max: 'all_others', self: 'forbidden' },
  peach_garden: { min: 1, max: 'all', self: 'allowed' },
  duress: { min: 2, max: 2, self: 'allowed' },
  indulgence: ONE_OTHER,
  lightning: NO_TARGET,
  harvest: NO_TARGET,
  // equipment — "equipping IS the effect", always self, no seat to pick
  zhuge_crossbow: NO_TARGET,
  gender_swords: NO_TARGET,
  blue_steel_sword: NO_TARGET,
  frost_blade: NO_TARGET,
  rock_cleaving_axe: NO_TARGET,
  green_dragon_blade: NO_TARGET,
  serpent_spear: NO_TARGET,
  heaven_scorcher: NO_TARGET,
  unicorn_bow: NO_TARGET,
  eight_trigrams: NO_TARGET,
  renwang_shield: NO_TARGET,
  plus_horse: NO_TARGET,
  minus_horse: NO_TARGET,
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
    // 闪 and 无懈可击 are only ever RESPONSES (their canPlay() is false) —
    // offering either in the action phase would be a guaranteed rejection.
    if (card.effectKey === 'dodge' || card.effectKey === 'nullification') return 'wrong_card';
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

/**
 * AoE tricks (南蛮入侵 · 万箭齐发 · 桃园结义) target every eligible seat
 * AUTOMATICALLY — the rulebook gives the player no choice, so the UI must not
 * ask (7.2 playtest feedback: manual seat-clicking read as broken). Returns the
 * full eligible list for an all-targets card, or null for a card where the
 * player genuinely chooses (借刀杀人's two seats stay manual). GameTable fills
 * the selection with this on card pick and ignores seat clicks while it holds.
 */
export function autoTargets(
  state: TableState,
  viewerId: string,
  cardId: string,
): string[] | null {
  const hint = targetHint(cardId);
  if (!hint || (hint.max !== 'all_others' && hint.max !== 'all')) return null;
  return candidateTargets(state, viewerId, cardId);
}

/**
 * 7.2 UX: ACTIVE skills — the third face of a Skill, started by its owner in
 * their own action phase through the `useSkill` move. The server enforces
 * everything (exact cost via activeCardCount, targets via the active's
 * TargetSpec, 每回合限一次 via activeLimit); this table mirrors those specs the
 * same way TARGET_HINTS mirrors card TargetSpecs, so the UI can offer the right
 * shape. Until 7.2's live playtest, NOTHING offered them: the move existed on
 * both ends and no button fired it — 制衡/结姻/离间 were simply unreachable.
 */
export interface ActiveSkillHint {
  /** Exact hand-card cost, or 'any' (制衡 discards any number incl. zero; 仁德
   * gives away any number ≥ 1). */
  cards: number | 'any';
  /** Cost floor when `cards` is 'any'. */
  minCards: number;
  targets: TargetHint;
  /** Mirrors activeLimit: true ⇒ engine writes `used.active.<id>` into the
   * (public) turnFlags when spent — which is what greys the button. */
  oncePerTurn: boolean;
}

export const ACTIVE_SKILL_HINTS: Record<string, ActiveSkillHint> = {
  zhiheng: { cards: 'any', minCards: 0, targets: { min: 0, max: 0, self: 'only' }, oncePerTurn: true },
  rende: { cards: 'any', minCards: 1, targets: { min: 1, max: 1, self: 'forbidden' }, oncePerTurn: false },
  jieyin: { cards: 2, minCards: 2, targets: { min: 1, max: 1, self: 'forbidden' }, oncePerTurn: true },
  lijian: { cards: 1, minCards: 1, targets: { min: 2, max: 2, self: 'forbidden' }, oncePerTurn: true },
  fanjian: { cards: 0, minCards: 0, targets: { min: 1, max: 1, self: 'forbidden' }, oncePerTurn: true },
  qingnang: { cards: 1, minCards: 1, targets: { min: 1, max: 1, self: 'allowed' }, oncePerTurn: true },
  kurou: { cards: 0, minCards: 0, targets: { min: 0, max: 0, self: 'only' }, oncePerTurn: false },
};

/** The engine's own spent-flag for a once-per-turn active — engine/limits.ts's
 * activeLimitKey. turnFlags are public, so the client may read it to grey. */
export function activeSkillSpent(state: TableState, skillId: string): boolean {
  const hint = ACTIVE_SKILL_HINTS[skillId];
  if (!hint?.oncePerTurn) return false;
  return state.turnFlags[`used.active.${skillId}`] === true;
}

/** The viewer's usable ACTIVE skills — offered only during their own 'act'. */
export function activeSkillsFor(state: TableState, viewerId: string): string[] {
  const player = state.players[viewerId];
  if (!player) return [];
  const general = generalById(player.generalId);
  if (!general) return [];
  return general.skillIds.filter((id) => id in ACTIVE_SKILL_HINTS);
}

/** Seats the picker offers for an active skill — same over-offer-and-let-the-
 * server-refuse contract as candidateTargets (predicates like 结姻's "wounded
 * male" stay server-side). */
export function skillCandidateTargets(
  state: TableState,
  viewerId: string,
  skillId: string,
): string[] {
  const hint = ACTIVE_SKILL_HINTS[skillId];
  if (!hint || hint.targets.max === 0) return [];
  return state.seats.filter((id) => {
    const player = state.players[id];
    if (!player?.alive) return false;
    if (id === viewerId) return hint.targets.self !== 'forbidden';
    return hint.targets.self !== 'only';
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
