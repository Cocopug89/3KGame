// The state shape a *client* actually receives — i.e. the output of
// `playerView()` in server/src/bgio/game.ts, NOT the engine's own `GState`.
//
// These two shapes are deliberately different (docs/engine-design.md §6):
// boardgame.io runs playerView over G before any client — or any integration
// test — ever sees it, so the board must be typed against the stripped view or
// it will lie about what's available:
//   • drawPile      → drawPileCount (the pile itself is NEVER sent)
//   • stack         → gone entirely
//   • other players: hand → handCount, role hidden unless roleRevealed
//   • pending       → the full request only for the player being asked;
//                     everyone else gets { kind, waitingOn }
//
// If playerView() changes, this file changes with it. Nothing here imports
// from server/ (separate workspace, and importing it would ship the rules
// engine to the browser) — the price of that is that this mirror is by hand.

export type Role = 'lord' | 'loyalist' | 'rebel' | 'traitor';
export type TurnPhase = 'prep' | 'judge' | 'draw' | 'action' | 'discard' | 'end';
export type CardId = string;
export type PlayerId = string;

export interface EquipmentView {
  weapon: CardId | null;
  armour: CardId | null;
  plusHorse: CardId | null;
  minusHorse: CardId | null;
}

interface PlayerViewBase {
  id: PlayerId;
  seat: number;
  roleRevealed: boolean;
  generalId: string;
  maxHp: number;
  hp: number;
  alive: boolean;
  equipment: EquipmentView;
  /** Delayed tricks, LIFO — the most recently placed card judges first. */
  judgementZone: CardId[];
  /** Only `pub.*` keys reach other clients (per §6; enforcement is task 5.4's F2). */
  flags: Record<string, unknown>;
}

/** The viewer's own seat: real hand, real role. */
export interface SelfPlayerView extends PlayerViewBase {
  hand: CardId[];
  role: Role;
}

/** Everyone else: card *count* only, and a role only once it's been revealed. */
export interface OtherPlayerView extends PlayerViewBase {
  handCount: number;
  role?: Role;
}

export type AnyPlayerView = SelfPlayerView | OtherPlayerView;

export function isSelfView(p: AnyPlayerView): p is SelfPlayerView {
  return Array.isArray((p as SelfPlayerView).hand);
}

/** The request kinds the engine can block on — one per stage in
 * server/src/bgio/game.ts. `demandCard` is THE card-response prompt as of 4.1b
 * (skill-trigger-design §5): 杀→闪, 濒死→桃, 决斗→杀 and trick→无懈可击 all arrive
 * as one kind, and `respondDodge`/`respondPeach` were deleted.
 *
 * The last seven landed with Batch B/C (tasks 4.3/4.4) and had no prompt at all
 * until now — the engine could block on them and the board would offer nothing,
 * which is a stalled table (see prompts.ts's header). They are here because
 * interaction.test.ts drives every stage in the shared stage/move map through
 * promptFor() and fails on any that produces nothing.
 *
 * 'orderTriggers' (§3.1 step 3) is STILL deliberately absent: no Standard general
 * can reach it, and promptFor() returning null for it is honest — a board that
 * silently invents an order would be worse than one that shows nothing. */
export type PromptKind =
  | 'act'
  | 'discard'
  | 'demandCard'
  | 'confirmSkill'
  | 'chooseCard'
  /** 刚烈 · 洛神 — pick one of a short labelled list. */
  | 'chooseOption'
  /** 突袭 — pick a player rather than a card. */
  | 'choosePlayer'
  /** 反间 — name a suit, blind. */
  | 'declareSuit'
  /** 观星 — re-order the top of the draw pile. */
  | 'guanxing'
  /** 鬼才 — replace an in-flight judgement card with one of your own. */
  | 'guicaiRetrial'
  /** 遗计 — hand the two drawn cards out, one seat at a time. */
  | 'yijiDistribute'
  /** 流离 — discard a card to push a 杀 onto someone else. */
  | 'liuliRedirect';

/** One entry in a `chooseOption` request. The engine mints both the id and the
 * i18n key (server/src/content/skills/ganglie.ts, luoshen.ts) and ships them on
 * the request — the client renders what it is given and never invents an option,
 * exactly as it never invents a `chooseCard` slot. */
export interface PromptOption {
  id: string;
  labelKey: string;
}

/** The four suits, in the order 反间's picker offers them. The engine validates
 * the answer against this same list (bgio/game.ts's declareSuit move). */
export const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'] as const;
export type Suit = (typeof SUITS)[number];

/**
 * One thing you may point at in a `chooseCard` request — the client mirror of
 * server/src/engine/cardChoice.ts's CardSlot (过河拆桥/顺手牵羊, task 3.3).
 *
 * A hand card is addressed by its POSITION in the server's own `player.hand`
 * array, never by id: an id carries suit and rank, so sending the victim's hand
 * ids so the attacker could click one would be handing them the hand. Equipment
 * and judgement-zone cards are already face up, so those are named by id.
 *
 * The index is the server's array order and means nothing else — never re-sort a
 * hand for display and send the display index back.
 */
export type CardSlot =
  | { z: 'hand'; index: number }
  | { z: 'equip'; cardId: CardId }
  | { z: 'judgementZone'; cardId: CardId }
  /** 五谷丰登's public pool (task 3.4) — face up by definition, named by id.
   * Missing from this mirror until 7.2's live playtest hit it: the server
   * offered these slots, ChoicePanel's zone filters dropped them all, and the
   * table stalled on an empty picker. */
  | { z: 'revealed'; cardId: CardId };

/** The request, in full, when *you* are the one being asked. */
export interface SelfPendingView {
  kind: string;
  playerId: PlayerId;
  [k: string]: unknown;
}

/** What onlookers get: who is being asked, and for what kind of answer. */
export interface OnlookerPendingView {
  kind: string;
  waitingOn: PlayerId;
}

export type PendingView = SelfPendingView | OnlookerPendingView | null;

export function isSelfPending(p: PendingView): p is SelfPendingView {
  return p != null && typeof (p as SelfPendingView).playerId === 'string';
}

/** Whoever the engine is currently blocked on, from either variant. */
export function pendingPlayerId(p: PendingView): PlayerId | null {
  if (p == null) return null;
  return isSelfPending(p) ? p.playerId : (p as OnlookerPendingView).waitingOn;
}

export interface LogEntryView {
  key: string;
  params?: Record<string, unknown>;
}

/** The general-selection window (task 5.2), as playerView sends it: your own
 * candidates and nobody else's, who is still choosing, and the Lord's pick —
 * public the moment it's made, because they pick first and in the open.
 * Everyone else's pick stays hidden until the window closes: `lockedIn` is the
 * *fact* that they chose, never the choice. */
export interface SelectionView {
  lord: PlayerId;
  awaiting: PlayerId[];
  /** Yours. Empty for a spectator. */
  candidates: string[];
  lockedIn: PlayerId[];
  lordGeneralId: string | null;
  myPick: string | null;
}

export interface TableState {
  /** Non-null ⇔ the match hasn't been dealt yet — everyone is still picking a
   * general, and no other field here is meaningful (no hands, no HP, no turn).
   * Optional because the 6.1 fixtures predate it and describe live tables. */
  selection?: SelectionView | null;
  drawPileCount: number;
  discardPile: CardId[];
  /** 五谷丰登's face-up pool — public and empty the rest of the time. Optional
   * because the 6.1 fixtures predate it. */
  revealed?: CardId[];
  players: Record<PlayerId, AnyPlayerView>;
  /** Seat order, index = seat number. Dead players stay in the array. */
  seats: PlayerId[];
  activeSeat: number;
  turnPhase: TurnPhase;
  skipPhases: TurnPhase[];
  turnFlags: { strikesPlayed: number; strikeLimit: number; [k: string]: unknown };
  pending: PendingView;
  log: LogEntryView[];
  gameOver?: { winners: PlayerId[]; condition: Role };
}
