// Win conditions (task 5.3) — plan §2 "Objective (by role)".
//
// Checked exactly once per death (pump.ts's 'dying' case, right after
// resolveDeath) because a death is the only thing in Standard edition that can
// end a game: nobody wins by drawing a card. `pump()`'s loop condition already
// halts on `G.gameOver`, so setting it here is what stops the engine — no other
// module needs to know the game can end.
//
// The four objectives, as rules rather than prose:
//
//   Lord      — survive; wins once no Rebel and no Traitor is alive.
//   Loyalist  — wins with the Lord (dead Loyalists still win: it's a side, not
//               a survival contest).
//   Rebel     — kill the Lord. Same faction rule: every Rebel wins, alive or not.
//   Traitor   — be the LAST person standing. If the Lord dies while anyone else
//               is still alive, the Rebels take it, even if every Rebel is dead —
//               the Traitor's win is strictly "last one at the table."
//
// This module must not import boardgame.io — see docs/engine-design.md §8.

import type { GState, PlayerId, Role } from './state.js';

export function livingPlayers(G: GState): PlayerId[] {
  return G.seats.filter((id) => G.players[id]?.alive);
}

function playersWithRole(G: GState, ...roles: readonly Role[]): PlayerId[] {
  return G.seats.filter((id) => roles.includes(G.players[id].role));
}

export interface VictoryResult {
  winners: PlayerId[];
  /** The side that won — 'lord' covers the Loyalists too (they win together). */
  condition: Role;
}

/**
 * The pure question: has this table been won? `null` ⇔ play continues.
 *
 * Returns the *side*, not the survivors — a Loyalist who died in turn 3 still
 * wins if the Lord is standing at the end, and that's what `winners` says.
 * Tolerates a table with no Lord (engine fixtures build those) by never ending.
 */
export function winnersFor(G: GState): VictoryResult | null {
  const lord = G.seats.find((id) => G.players[id]?.role === 'lord');
  if (!lord) return null;

  const living = livingPlayers(G);

  if (G.players[lord].alive) {
    const threats = living.filter((id) => {
      const role = G.players[id].role;
      return role === 'rebel' || role === 'traitor';
    });
    if (threats.length > 0) return null;
    return { winners: playersWithRole(G, 'lord', 'loyalist'), condition: 'lord' };
  }

  // The Lord is dead — the game is over either way, and the only question is
  // whether the Traitor is alone at the table.
  if (living.length === 1 && G.players[living[0]].role === 'traitor') {
    return { winners: [living[0]], condition: 'traitor' };
  }
  return { winners: playersWithRole(G, 'rebel'), condition: 'rebel' };
}

/**
 * Applies it: sets `G.gameOver` (which is what actually stops `pump()`), turns
 * every remaining hidden role face up, and logs the result. Returns whether the
 * game ended, so the caller can skip pushing consequences nobody will resolve.
 *
 * Revealing every role at the end is a rule, not a UI nicety: the hidden-role
 * game is over, and `playerView` sends a role only when `roleRevealed` is set —
 * so this is the single line that lets the final table show who everyone was.
 */
export function checkVictory(G: GState): boolean {
  if (G.gameOver) return true;
  const result = winnersFor(G);
  if (!result) return false;

  G.gameOver = result;
  for (const id of G.seats) {
    G.players[id].roleRevealed = true;
  }
  G.log.push({ key: 'log.game_over', params: { role: result.condition } });
  return true;
}
