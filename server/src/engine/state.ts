// Core engine state shape (design: task 2.1, implementation: task 2.2b).
// Serialisable, no class instances, no functions, no Date.now(), no
// Math.random() — boardgame.io must be able to snapshot, diff, and (later)
// replay it. See docs/engine-design.md §1.
//
// This module must not import boardgame.io — see docs/engine-design.md §8.
// `Frame` is imported type-only from ./frames.js, which itself imports these
// types type-only; that circular reference is erased at compile time and is
// safe (no runtime circularity between two files with no value exports used
// by each other).

import type { DamageKind, Frame } from './frames.js';
import type { SelectionState } from './selection.js';

export type CardId = string; // "strike_2c" — matches content/standard/cards.json .id
export type PlayerId = string; // boardgame.io playerID, "0".."7"

export type TurnPhase = 'prep' | 'judge' | 'draw' | 'action' | 'discard' | 'end';

export type Role = 'lord' | 'loyalist' | 'rebel' | 'traitor';

export interface LogEntry {
  /** i18n key, e.g. 'log.plays_strike' — never display text. */
  key: string;
  params?: Record<string, unknown>;
}

/**
 * Non-null ⇔ the engine is blocked on a player's answer. `kind` names the
 * boardgame.io stage the bgio adapter (task 2.3) puts `playerId` into —
 * 'act' | 'discard' | 'demandCard' | 'confirmSkill' | 'orderTriggers' |
 * 'chooseGeneral' (docs/engine-design.md §7). Left loose (extra fields via the
 * index signature) on purpose: each request kind carries different data.
 *
 * ⚠️ **A PendingRequest payload is a hidden-information channel**
 * (skill-trigger-design §6): playerView sends the full object to `playerId` and
 * `{kind, waitingOn}` to everyone else. Anything put in here is disclosed to
 * that one player — and it must be information that player is entitled to.
 * 观星 (4.4) relies on exactly this; 3.1 §5's slot-based `chooseCard` exists
 * because the *attacker* is not entitled to the victim's hand ids.
 */
export interface PendingRequest {
  kind: string;
  playerId: PlayerId;
  [k: string]: unknown;
}

export interface PlayerState {
  id: PlayerId;
  seat: number;
  /** Hidden unless roleRevealed (lord: true from setup; others flip true on death). */
  role: Role;
  roleRevealed: boolean;
  generalId: string; // content/standard/generals.json .id
  maxHp: number; // general.maxHp (+1 if lord)
  hp: number;
  alive: boolean;
  hand: CardId[]; // stripped → handCount for everyone else (playerView, task 5.4)
  equipment: {
    weapon: CardId | null;
    armour: CardId | null;
    plusHorse: CardId | null;
    minusHorse: CardId | null;
  };
  /** Delayed tricks. Resolution order is LIFO — the most recently placed
   * card judges FIRST (docs/engine-design.md §4). */
  judgementZone: CardId[];
  /** Skill state, e.g. { 'guanyu.wusheng': true }. Only `pub.*`-prefixed keys
   * are sent to other clients (playerView, task 5.4). */
  flags: Record<string, unknown>;
}

/**
 * The damage currently in flight — skill-trigger-design §2.1. Non-null ⇔ the
 * `damage.before` window is open: the numbers are settled but nothing has been
 * applied yet, and a listener may still patch this (裸衣 +1, 青釭剑 ignoreArmour,
 * 寒冰剑/仁王盾 prevented) through the `{t:'setDamage'}` frame — never by
 * reaching down the stack and editing the frame underneath it.
 *
 * **Public in playerView**, for the same reason G.judgement is: a 杀 landing is
 * face up at a real table.
 */
export interface DamageInfo {
  source: PlayerId | null;
  target: PlayerId;
  amount: number;
  kind: DamageKind;
  card?: CardId;
  /** 青釭剑 — the damage ignores the target's armour. */
  ignoreArmour?: boolean;
  /** 寒冰剑 / 仁王盾 — the damage is cancelled; step 2 applies nothing. */
  prevented?: boolean;
  /** Identifies this damage *instance*. The scope of the `once_per_damage`
   * trigger limit (§3.5): 遗计 is per point of damage, not per turn, so a turn
   * flag would silently halve 郭嘉 on the first expansion whose hits aren't all
   * 1 point. Monotonic within a turn — that is all it has to be. */
  seq: number;
}

/**
 * The card demand currently in flight — skill-trigger-design §12.2. Non-null ⇔
 * some frame has asked a player for `count` cards of `kind` and hasn't yet read
 * the answer.
 *
 * Lifted into state (rather than living inside the demand frame) for one
 * reason: a **proxy** supplier — 护驾 answers for the lord, 激将 for 刘备 — runs
 * through frames of its own and has to get its card back to the *original*
 * demander, whose `resume` frame it may not reach down the stack and patch
 * (§2.1). It writes `supplied` here instead, and `{t:'demandClose'}` hands it
 * back through the ordinary `applyToResumeFrame` channel.
 *
 * `supplied: []` and `supplied: null` are NOT the same thing: an empty array is
 * "answered, with no card" — a *deemed* 闪 from 八卦阵 (3.6) — and null is "not
 * answered." Do not collapse them.
 */
export interface DemandInfo {
  kind: string;
  /** Who is being asked. */
  from: PlayerId;
  /** Who is asking, when a player is (the 杀's source, for 无双's demandCount
   * fold). null for a demand nobody in particular raised — the dying window's
   * 桃, a nullification. */
  by: PlayerId | null;
  count: number;
  /** i18n key explaining *why* — rendered by the prompt. */
  reasonKey: string;
  /** Who the demand is *about*, when that isn't `by`: the dying player a 桃 is
   * being asked for. Display-only. */
  subject?: PlayerId;
  supplied: CardId[] | null;
}

export interface GState {
  // ── hidden zones (stripped by playerView, task 5.4) ──────────────────
  drawPile: CardId[]; // index 0 = top. NEVER sent to any client.
  discardPile: CardId[]; // public; top card matters for a few effects

  // ── players ────────────────────────────────────────────────────────
  players: Record<PlayerId, PlayerState>;
  /** Seat order, index = seat number. Dead players stay in the array
   * (distance is measured over living seats only, task 2.5). */
  seats: PlayerId[];

  // ── turn ───────────────────────────────────────────────────────────
  activeSeat: number;
  turnPhase: TurnPhase;
  /** Set by 乐不思蜀 etc., cleared at end of turn. */
  skipPhases: TurnPhase[];
  turnFlags: {
    strikesPlayed: number;
    /** 1 by default; Infinity with 诸葛连弩. */
    strikeLimit: number;
    /** Skill-scoped, cleared each turn. */
    [k: string]: unknown;
  };

  // ── resolution (task 2.3+) ────────────────────────────────────────
  /** LIFO. stack[stack.length - 1] is what runs next. */
  stack: Frame[];
  /** Non-null ⇔ engine is blocked on a player's answer. */
  pending: PendingRequest | null;
  /** Non-null ⇔ the match hasn't started yet: players are still choosing
   * generals (task 5.2, engine/selection.ts). The stack is empty and nothing
   * pumps while this is set. Separate from `pending` on purpose — selection is
   * the one window several players answer *at the same time*, and `pending` is
   * single-valued by design. */
  selection: SelectionState | null;

  /**
   * The judgement (判定) currently in flight — docs/judgement-nullification-design.md
   * §1.2. Non-null ⇔ a card has been flipped and the retrial window is open.
   *
   * **Public in playerView.** A flipped judgement card is face up at a real
   * table, and a retrial skill in another player's hand is only playable
   * *because* they can see it. This is why the card is lifted out of
   * `drawPile` into its own field rather than peeked in place: the instant it's
   * flipped it stops being hidden information, and engine-design §6's rule is
   * delete hidden zones, never mask them.
   *
   * `cardId` is the CURRENT judgement card — a `{t:'retrial'}` frame (改判:
   * 鬼才) replaces it in place, which is the whole reason the field exists.
   */
  /** skill-trigger-design §2.1 — see DamageInfo. Public. */
  damage: DamageInfo | null;
  /** skill-trigger-design §12.2 — see DemandInfo. Public (everyone at a real
   * table can see that 张三 is being asked for a 闪). */
  demand: DemandInfo | null;
  judgement: {
    target: PlayerId;
    cardId: CardId;
    /** i18n key: 'judge.indulgence' | 'judge.lightning' | 'judge.eight_trigrams' */
    reasonKey: string;
    /** The delayed trick / equipment that caused this judgement. */
    sourceCard?: CardId;
  } | null;
  log: LogEntry[];

  gameOver?: { winners: PlayerId[]; condition: Role };
}
