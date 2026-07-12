// THE anti-cheat surface. Task 5.4 — docs/anti-cheat-audit.md.
//
// Extracted from bgio/game.ts by the 5.4 audit for one reason: this function is
// the entire boundary between what the server knows and what a browser is handed,
// and a boundary that important should be a file you can open, grep, and test on
// its own — not eighty lines buried in the middle of the move handlers. The
// behaviour is unchanged by the move; `ThreeKingdomsGame.playerView` still points
// here.
//
// THE RULE (engine-design §6): **delete hidden zones, never mask them.** A masked
// card is still a card id on the wire, and the wire is where a cheating client
// reads. Everything a client is not entitled to must be *absent* from the object
// this returns — not zeroed, not shuffled, not obfuscated.
//
// Three things are deliberately PUBLIC, and 5.4 confirmed each against the rules
// rather than assuming: **G.judgement** (a flipped judgement card is face up, and
// a retrial skill — 鬼才 — is only playable *because* its owner can see it),
// **G.damage** (a 杀 landing is not a secret), and **G.demand** (everyone at a
// real table can see that 张三 is being asked for a 闪). `G.revealed` (五谷丰登's
// pool) is public for the same reason and is empty the rest of the time.
//
// The two channels that carry secrets and are *supposed* to:
//   - `G.pending`, sent whole to `pending.playerId` and as `{kind, waitingOn}` to
//     everyone else. 观星 shows 诸葛亮 the top of the draw pile through exactly
//     this (skill-trigger-design §6). **Anything a future request kind puts in a
//     payload is disclosed to that one player** — which is fine, as long as that
//     player is entitled to it. 3.1 §5's slot-based `chooseCard` exists because
//     the *attacker* is not entitled to the victim's hand.
//   - `G.log`, which is sent WHOLE to EVERY client. That makes it the one public
//     broadcast channel content can write to, and it is where 5.4 found its only
//     real leak (反馈/突袭 were naming a card lifted out of a hidden hand). The
//     invariant, now pinned by tests: **a log entry may only name a card that is
//     already face up.** If a card moved hand → hand, log the event, not the card.

import type { GState, PlayerId } from '../engine/state.js';

/**
 * F2 (docs/phase-2-review.md), fixed in 4.1b: `playerView` used to spread every
 * player's whole `flags` object to every client, though engine-design §6 says
 * only `pub.*` keys are public. It was harmless only for as long as `flags`
 * stayed empty — so the filter went in before the first skill that could leak
 * through it existed.
 *
 * (Skill state through Phase 4 is turn-scoped and lives in G.turnFlags, which IS
 * public — a turn flag records something the table watched happen: 裸衣's choice,
 * 仁德's gifts, which limits have been spent. 5.4 re-checked every turnFlag key
 * written by 3.x/4.x: all of them are booleans, counters or player ids. **No
 * turn flag carries a card id**, and none should.)
 */
export function publicFlags(flags: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(flags).filter(([key]) => key.startsWith('pub.')));
}

/** What a client may know about the general-selection window (task 5.2): their
 * own candidates, who is still choosing — and the Lord's pick, which is public
 * the moment it's made (they pick first, in the open). Everyone else's pick stays
 * hidden until selection ends and the generals go on the table, so nobody can
 * tailor their own choice to a pick that hasn't been revealed. */
export function selectionView(G: GState, playerID: PlayerId | null) {
  const selection = G.selection;
  if (!selection) return null;
  const { lord, awaiting } = selection;
  return {
    lord,
    awaiting,
    candidates: playerID && selection.candidates[playerID] ? selection.candidates[playerID] : [],
    /** Locked in already — the fact, not the choice. */
    lockedIn: Object.keys(selection.picked),
    lordGeneralId: selection.picked[lord] ?? null,
    myPick: playerID ? (selection.picked[playerID] ?? null) : null,
  };
}

export function playerView({ G, playerID }: { G: GState; playerID: PlayerId | null }) {
  // Deleted outright, for everyone, including a spectator (playerID === null):
  // the draw pile (its ORDER is the game's biggest secret — 观星 exists to peek
  // at it) and the stack (every in-flight frame's ctx carries card ids: the card
  // a chooseCard answer resolved to, the ids 遗计 just drew).
  const { drawPile, stack: _stack, selection: _selection, ...publicG } = G;

  const players: Record<string, unknown> = {};
  for (const [id, p] of Object.entries(G.players)) {
    if (id === playerID) {
      players[id] = p;
      continue;
    }
    const { hand, role, flags, ...restOfPlayer } = p;
    players[id] = {
      ...restOfPlayer,
      flags: publicFlags(flags),
      handCount: hand.length,
      ...(p.roleRevealed ? { role } : {}),
    };
  }

  const pending = !G.pending
    ? null
    : G.pending.playerId === playerID
      ? G.pending
      : { waitingOn: G.pending.playerId, kind: G.pending.kind };

  return {
    ...publicG,
    drawPileCount: drawPile.length,
    players,
    pending,
    selection: selectionView(G, playerID),
  };
}
