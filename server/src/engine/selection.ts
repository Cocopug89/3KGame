// Task 5.2 — general selection: the pre-game window where the Lord picks
// first, in the open, and everyone else then picks at the same time.
// (docs/three-kingdoms-plan.md §2 "Setup", steps 1–2.)
//
// Why this is NOT a stack/pending window like every other player decision:
// `G.pending` is single-valued by design — the engine blocks on exactly one
// answer at a time, which is right for every *rules* question (a 杀 asks one
// target; a dying window asks one player). Selection is not a rules question;
// it happens before the first frame is ever pushed, and non-Lords answer
// *simultaneously*. Modelling it as a run of single pendings would serialize
// what the tabletop does in parallel, and modelling parallel pendings would
// mean rebuilding `G.pending` as a list for the one case in the game that
// needs it. So selection gets its own field (`G.selection`), the stack stays
// empty until it's done, and the bgio adapter maps `awaiting` straight onto
// boardgame.io's `activePlayers` (which is already multi-player).
//
// This module must not import boardgame.io — see docs/engine-design.md §8.

import { generals } from '@3k/shared';
import type { GState, PlayerId } from './state.js';
import type { RNG } from './rng.js';

/** The Lord picks from a wider pool than everyone else (plan §2, step 2). */
export const LORD_CANDIDATES = 5;
export const PLAYER_CANDIDATES = 3;

export interface SelectionState {
  lord: PlayerId;
  /** Candidate general ids per player. A player is only ever sent their own
   * (see playerView) — seeing an opponent's options is a real information
   * advantage, and it's the kind of leak task 5.4 audits for. */
  candidates: Record<PlayerId, string[]>;
  /** Locked-in picks. Only the Lord's is public before selection ends — they
   * pick first and reveal, which is the whole point of Lord-first: everyone
   * else chooses knowing who they may have to face (or protect). */
  picked: Record<PlayerId, string>;
  /** Who the game is waiting on right now: the Lord alone, then everyone else
   * at once. Empty ⇔ selection is finished. */
  awaiting: PlayerId[];
}

/**
 * Deals every player a private hand of candidate generals — no general
 * appears in two players' hands (they're physical cards on the table).
 *
 * The Lord's pool shrinks rather than the others' when the deck runs short:
 * 8 players × 3 + a 5-card Lord pool needs 26 generals and Standard has 25.
 * Giving the Lord 4 in an 8-player game keeps everyone else's choice intact
 * and still leaves the Lord the widest pool at the table.
 */
export function dealCandidates(
  playerIds: readonly PlayerId[],
  lord: PlayerId,
  rng: RNG,
): Record<PlayerId, string[]> {
  const others = playerIds.filter((id) => id !== lord);
  const needForOthers = others.length * PLAYER_CANDIDATES;
  const lordCount = Math.min(LORD_CANDIDATES, generals.length - needForOthers);
  if (lordCount < 2) {
    throw new Error(
      `dealCandidates: only ${generals.length} generals for ${playerIds.length} players — not enough to deal a real choice`,
    );
  }

  const pool = rng.shuffle(generals.map((g) => g.id));
  const candidates: Record<PlayerId, string[]> = {};
  candidates[lord] = pool.splice(0, lordCount);
  for (const id of others) {
    candidates[id] = pool.splice(0, PLAYER_CANDIDATES);
  }
  return candidates;
}

export function startSelection(
  playerIds: readonly PlayerId[],
  lord: PlayerId,
  rng: RNG,
): SelectionState {
  return {
    lord,
    candidates: dealCandidates(playerIds, lord, rng),
    picked: {},
    // The Lord alone, first. Everyone else is dealt in once they've revealed.
    awaiting: [lord],
  };
}

export function isSelectionComplete(selection: SelectionState): boolean {
  return selection.awaiting.length === 0;
}

/**
 * Locks in one player's pick and re-computes who the game is still waiting
 * on. Returns false (changing nothing) if the pick isn't legal — the caller
 * is a boardgame.io move, and an illegal move must not half-apply.
 */
export function applyPick(G: GState, playerId: PlayerId, generalId: string): boolean {
  const selection = G.selection;
  if (!selection) return false;
  if (!selection.awaiting.includes(playerId)) return false;
  if (!selection.candidates[playerId]?.includes(generalId)) return false;
  if (selection.picked[playerId]) return false;

  selection.picked[playerId] = generalId;

  if (playerId === selection.lord) {
    // The Lord has revealed — everyone else now picks, simultaneously.
    selection.awaiting = G.seats.filter((id) => id !== selection.lord);
  } else {
    selection.awaiting = selection.awaiting.filter((id) => id !== playerId);
  }
  return true;
}
