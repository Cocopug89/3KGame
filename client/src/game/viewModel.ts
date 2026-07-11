// Pure view-model helpers for the table (task 6.1). No React, no i18next, no
// DOM — every function here is a plain data transform, which is what makes the
// layout unit-testable without a renderer (client/test/viewModel.test.ts).
//
// Two rules this file exists to enforce:
//   1. The board reads the *view* (TableState), never engine internals.
//   2. Nothing here returns display text — only i18n keys. (Non-negotiable
//      architecture: every user-facing string is a key.)

import type {
  AnyPlayerView,
  CardId,
  PendingView,
  PlayerId,
  TableState,
  TurnPhase,
} from './viewTypes.js';
import { isSelfView, pendingPlayerId } from './viewTypes.js';

/** The engine's TurnPhase values and the locale files' phase.* keys don't use
 * the same words ('prep' vs 'phase.preparation'), so the mapping is explicit
 * rather than a template string — a typo'd key would otherwise render raw. */
export const PHASE_I18N_KEY: Record<TurnPhase, string> = {
  prep: 'phase.preparation',
  judge: 'phase.judgement',
  draw: 'phase.draw',
  action: 'phase.action',
  discard: 'phase.discard',
  end: 'phase.end',
};

export type EquipmentSlot = 'weapon' | 'armour' | 'plusHorse' | 'minusHorse';

/** Fixed slot order — a seat's equipment row must not reflow as cards come and
 * go, so empty slots still render. */
export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = [
  'weapon',
  'armour',
  'plusHorse',
  'minusHorse',
] as const;

export const EQUIPMENT_SLOT_I18N_KEY: Record<EquipmentSlot, string> = {
  weapon: 'equipment_type.weapon',
  armour: 'equipment_type.armour',
  plusHorse: 'ui.plus_horse',
  minusHorse: 'ui.minus_horse',
};

export interface EquipmentSlotView {
  slot: EquipmentSlot;
  labelKey: string;
  cardId: CardId | null;
}

export function equipmentSlots(player: AnyPlayerView): EquipmentSlotView[] {
  return EQUIPMENT_SLOTS.map((slot) => ({
    slot,
    labelKey: EQUIPMENT_SLOT_I18N_KEY[slot],
    cardId: player.equipment[slot],
  }));
}

/** Works for either view variant: the viewer sees their own cards, everyone
 * else is a count. */
export function handSize(player: AnyPlayerView): number {
  return isSelfView(player) ? player.hand.length : player.handCount;
}

/** An open dying window — alive, but at or below 0 hp, waiting on 桃
 * (engine-design §5). Renders as 濒死, not as death. */
export function isDying(player: AnyPlayerView): boolean {
  return player.alive && player.hp <= 0;
}

/** Roles are hidden until revealed; the lord is revealed from setup, everyone
 * else flips on death. The viewer always knows their own. Returns an i18n key
 * or null (= render the "unknown" back). */
export function roleI18nKey(player: AnyPlayerView, isViewer: boolean): string | null {
  if (isViewer && isSelfView(player)) return `role.${player.role}`;
  if (player.roleRevealed && player.role) return `role.${player.role}`;
  return null;
}

export function turnOwnerId(state: TableState): PlayerId | undefined {
  return state.seats[state.activeSeat];
}

export interface SeatView {
  playerId: PlayerId;
  player: AnyPlayerView;
  /** Seat number as the engine knows it (index into state.seats). */
  seat: number;
  isViewer: boolean;
  /** Whose 回合 it is — not necessarily who is being asked for an answer. */
  isTurnOwner: boolean;
  /** The engine is blocked on this seat right now. */
  isWaitingOn: boolean;
  isDying: boolean;
}

function toSeatView(
  state: TableState,
  playerId: PlayerId,
  viewerId: PlayerId | null,
  waitingOn: PlayerId | null,
): SeatView {
  const player = state.players[playerId];
  return {
    playerId,
    player,
    seat: player.seat,
    isViewer: playerId === viewerId,
    isTurnOwner: playerId === turnOwnerId(state),
    isWaitingOn: playerId === waitingOn,
    isDying: isDying(player),
  };
}

/**
 * Seats in *seat order*, rotated so the viewer is first — the board draws the
 * viewer at the bottom and everyone else around the ring in play order from
 * there, which is only stable if the rotation happens here rather than in JSX.
 *
 * A spectator (viewerId null, or an id not seated) gets the unrotated order and
 * no self seat — that's exactly the boardgame.io "no playerID = spectator"
 * case, and the board must not crash on it.
 */
export function seatsForViewer(
  state: TableState,
  viewerId: PlayerId | null,
): { self: SeatView | null; others: SeatView[] } {
  const waitingOn = pendingPlayerId(state.pending);
  const order = state.seats;
  const viewerIndex = viewerId == null ? -1 : order.indexOf(viewerId);

  if (viewerIndex < 0) {
    return {
      self: null,
      others: order.map((id) => toSeatView(state, id, null, waitingOn)),
    };
  }

  const rotated = [...order.slice(viewerIndex + 1), ...order.slice(0, viewerIndex)];
  return {
    self: toSeatView(state, order[viewerIndex], viewerId, waitingOn),
    others: rotated.map((id) => toSeatView(state, id, viewerId, waitingOn)),
  };
}

export interface RingPosition {
  /** Percent of the table's width / height; the seat is centred on the point. */
  leftPct: number;
  topPct: number;
}

/**
 * Lays the non-viewer seats out on an ellipse around the table.
 *
 * The viewer sits at the bottom (270°), so the others sweep the remaining arc:
 * seat order runs *clockwise on screen* — first opponent at the lower left, up
 * the left side, across the top, down to the lower right — which is the
 * on-screen reading of "play passes to your left". A single opponent goes
 * straight to the top.
 *
 * Math angles (0° = right, 90° = up), y flipped for screen coords.
 */
export function ringPositions(count: number, rx = 40, ry = 34): RingPosition[] {
  if (count <= 0) return [];
  const START = 200; // lower-left
  const END = -20; // lower-right
  return Array.from({ length: count }, (_, i) => {
    const deg = count === 1 ? 90 : START + ((END - START) * i) / (count - 1);
    const rad = (deg * Math.PI) / 180;
    return {
      leftPct: 50 + rx * Math.cos(rad),
      topPct: 50 - ry * Math.sin(rad),
    };
  });
}

/** Top of the discard pile — the only discarded card that matters visually (and
 * to a few effects later). */
export function discardTop(state: TableState): CardId | null {
  return state.discardPile.length > 0 ? state.discardPile[state.discardPile.length - 1] : null;
}

/** The banner line: whose turn, what phase, and who we're all waiting on.
 * Keys only — the component does the t() call. */
export interface StatusView {
  phaseKey: string;
  turnOwnerId: PlayerId | undefined;
  isViewerTurn: boolean;
  waitingOnId: PlayerId | null;
  isViewerWaitedOn: boolean;
  pendingKind: string | null;
}

export function statusView(state: TableState, viewerId: PlayerId | null): StatusView {
  const waitingOnId = pendingPlayerId(state.pending);
  const owner = turnOwnerId(state);
  return {
    phaseKey: PHASE_I18N_KEY[state.turnPhase],
    turnOwnerId: owner,
    isViewerTurn: viewerId != null && owner === viewerId,
    waitingOnId,
    isViewerWaitedOn: viewerId != null && waitingOnId === viewerId,
    pendingKind: pendingKind(state.pending),
  };
}

function pendingKind(pending: PendingView): string | null {
  return pending == null ? null : pending.kind;
}
