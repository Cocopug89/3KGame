// The dying window (濒死) and death resolution — docs/engine-design.md §5,
// "the two interrupts everyone gets wrong." Pulled into its own module
// (rather than living inline in pump.ts) the same way distance.ts was:
// small pure/near-pure helpers that task 2.7's tests can exercise directly
// without constructing a whole stack.
//
// Implementation note vs. the doc's literal wording: §5 step 3 describes
// pushing the request *and* re-pushing the dying frame "underneath it" at
// the moment of asking. Actually doing that leaves a stale pre-baked
// continuation sitting on the stack that the answering move can't safely
// adjust (a "no" needs offset+1, not the same offset, and mutating a frame
// that isn't the dedicated 'resume' slot has no established mechanism —
// applyToResumeFrame is specifically scoped to 'resume' frames). Instead,
// the bgio respondPeach move (server/src/bgio/game.ts) itself pushes the
// correct single continuation once the answer is known: a `{t:'heal'}`
// frame for "yes" (after which the window is simply over — nothing further
// needs pushing, since a healed target can't still be dying), or a fresh
// `{t:'dying', offset: offset+1}` for "no". The *observable* behavior is
// identical to the spec: start with the dying player, proceed clockwise
// through the living, stop at the first save or after everyone's been
// asked once.
//
// This module must not import boardgame.io — see docs/engine-design.md §8.

import type { Frame } from './frames.js';
import type { GState, PlayerId } from './state.js';
import { getCard } from './cardIndex.js';

/**
 * The player standing `offset` living-seats clockwise from `target`,
 * counting `target` themselves as offset 0 (engine-design §5 point 2: "the
 * dying player themselves and proceeds clockwise" — dead seats are skipped
 * but stay in G.seats, same convention as distance.ts). Returns `null` once
 * `offset` has walked past every currently-living player — the caller's
 * signal that the window has closed with nobody saving them.
 */
export function askerAtOffset(G: GState, target: PlayerId, offset: number): PlayerId | null {
  const targetSeat = G.players[target]?.seat;
  if (targetSeat === undefined) {
    throw new Error(`askerAtOffset: unknown player '${target}'`);
  }
  const n = G.seats.length;
  let seen = -1;
  for (let step = 0; step < n; step++) {
    const seat = (targetSeat + step) % n;
    const playerId = G.seats[seat];
    if (!G.players[playerId]?.alive) continue;
    seen += 1;
    if (seen === offset) return playerId;
  }
  return null;
}

/**
 * Whether `playerId` currently holds a card that can save a dying player.
 *
 * ⚠️ NO LONGER ON THE ENGINE'S PATH as of 4.1b: the dying window asks through
 * `{t:'demand', kind:'peach'}`, and `{t:'demandAsk'}` makes this call itself —
 * through the `queries.cardsAs` fold, which is what lets 华佗's 急救 answer with
 * any red card, and 八卦阵-shaped skills answer with no card at all. A second
 * copy of the "can they answer?" rule here would drift the moment a skill
 * widened it. Kept only because it is a correct, tested description of the
 * base case, and because deleting a pure helper buys nothing.
 */
export function holdsPeach(G: GState, playerId: PlayerId): boolean {
  const player = G.players[playerId];
  if (!player) return false;
  return player.hand.some((cardId) => getCard(cardId).effectKey === 'peach');
}

/**
 * Death resolution (engine-design §5): reveal the role, move the hand,
 * every equipped card, and the judgement zone to the (public) discard pile,
 * mark not alive. A death mid-resolution does not cancel the rest of the
 * stack — only frames targeting the now-dead player are dropped, which
 * pump.ts's individual frame cases already do by checking `alive` when
 * popped (see the 'damage' case), not by scrubbing the stack here.
 *
 * Win-condition checking (`G.gameOver`) and the killer's reward/penalty
 * (Lord kills a Loyalist → Lord discards all cards; kills a Rebel → draw 3)
 * are explicitly out of scope: win conditions are Phase 5, and the reward
 * hooks need either a `{t:'trigger'}` fan-out (task 4.1, currently a
 * deliberate "not implemented" throw in pump.ts) or a skillRegistry entry.
 * This function only does the bookkeeping that's unconditionally true of
 * every death, regardless of who's playing or what killed them.
 */
export function resolveDeath(G: GState, target: PlayerId, killer: PlayerId | null = null): void {
  const player = G.players[target];
  if (!player) throw new Error(`resolveDeath: unknown player '${target}'`);
  void killer; // threaded through the frames for Phase 5's kill reward/penalty; nothing in Phase 3 reads it

  player.alive = false;
  player.roleRevealed = true;
  // The log line IS the reveal, as far as the renderer is concerned (F3 /
  // task 5.3): a hidden role becomes public at exactly this moment, and the
  // client learns it from here.
  G.log.push({ key: 'log.death', params: { target, role: player.role } });

  const { weapon, armour, plusHorse, minusHorse } = player.equipment;
  for (const cardId of [weapon, armour, plusHorse, minusHorse]) {
    if (cardId) G.discardPile.push(cardId);
  }
  player.equipment = { weapon: null, armour: null, plusHorse: null, minusHorse: null };

  G.discardPile.push(...player.hand, ...player.judgementZone);
  player.hand = [];
  player.judgementZone = [];

  endTurnIfTurnPlayerDied(G, target); // F1 — see the function's comment below
}

const EQUIPMENT_SLOTS = ['weapon', 'armour', 'plusHorse', 'minusHorse'] as const;

/**
 * 奖惩 — the kill reward and penalty (plan §2), task 5.3.
 *
 * Frames, not mutations (engine-design §3): the killer's three cards are a
 * `{t:'draw'}` and the Lord's forfeit is a `{t:'moveCards'}`, so both go through
 * the same primitives everything else does — and both therefore emit
 * `card.gained`/`card.lost` for the skills that listen (连营, 枭姬).
 *
 * The two rules, and the edges that make them look inconsistent until you read
 * them twice:
 *
 *   • Killing a REBEL pays 3 cards — to ANY killer, including another Rebel.
 *     The bounty is on the victim's role, not on whose side you are.
 *   • The LORD killing a LOYALIST forfeits their entire hand AND every piece of
 *     equipment. Nobody else pays it — a Rebel who kills a Loyalist keeps their
 *     cards.
 *   • Nothing at all is paid for killing the Lord or a Traitor, for a death with
 *     no killer (闪电, a 决斗 backfire), for killing yourself, or to a killer who
 *     died in the same resolution — a corpse draws no cards.
 *
 * Called by pump.ts's 'dying' case AFTER resolveDeath and only if the game
 * hasn't just ended: a reward drawn into a finished game is noise.
 */
export function deathConsequenceFrames(
  G: GState,
  dead: PlayerId,
  killer: PlayerId | null,
): Frame[] {
  if (killer === null || killer === dead) return [];
  const slayer = G.players[killer];
  if (!slayer?.alive) return [];

  const victimRole = G.players[dead]?.role;

  if (victimRole === 'rebel') {
    G.log.push({ key: 'log.kill_reward', params: { player: killer, n: 3 } });
    return [{ t: 'draw', player: killer, count: 3 }];
  }

  if (victimRole === 'loyalist' && slayer.role === 'lord') {
    G.log.push({ key: 'log.kill_penalty', params: { player: killer } });
    const frames: Frame[] = [];
    if (slayer.hand.length > 0) {
      frames.push({
        t: 'moveCards',
        cards: [...slayer.hand],
        from: { z: 'hand', player: killer },
        to: { z: 'discard' },
        by: killer,
      });
    }
    const equipped = EQUIPMENT_SLOTS.map((slot) => slayer.equipment[slot]).filter(
      (id): id is string => id !== null,
    );
    if (equipped.length > 0) {
      frames.push({
        t: 'moveCards',
        cards: equipped,
        from: { z: 'equip', player: killer },
        to: { z: 'discard' },
        by: killer,
      });
    }
    return frames;
  }

  return [];
}

/**
 * F1 (docs/phase-2-review.md): **the turn player dying during their own turn
 * used to wedge the game permanently.** `playCard` queues a fresh `act`
 * request underneath the play it pushes (2.4's soft-lock fix); if the play
 * kills its own source — 决斗 backfiring, 闪电 in the judge phase, 苦肉 taken
 * too far — that request popped after the death and `pump()` blocked forever
 * on a corpse with an empty stack. Unreachable with only 杀/闪/桃; reachable
 * on Phase 3's first cards.
 *
 * The fix has to end the turn *without* discarding work owed to other
 * players: engine-design §5 is explicit that "a death mid-resolution does not
 * cancel the rest of the stack — an AoE that kills player 3 still hits players
 * 4 and 5." So:
 *
 *   1. Drop the rest of THIS turn's phase frames (there is never more than one
 *      `{t:'phase'}` on the stack at a time, so this is precise, not a blunt
 *      instrument — no turn tagging needed).
 *   2. `unshift` an end-phase frame at the **bottom** of the stack, so
 *      everything still in flight (the AoE, a nullification chain mid-argument,
 *      the killer's own trigger) resolves first, and *then* the turn ends —
 *      resetting turnFlags/skipPhases and advancing activeSeat past the corpse.
 *
 * The dead-subject rule in pump.ts (`subjectOf`) is the backstop: the dead
 * player's own `act` request drops when popped. Both halves are needed —
 * with the filter alone, a request some *effect* queued for the now-dead
 * player would still wedge; with the dead-subject rule alone, the turn would
 * never end.
 */
export function endTurnIfTurnPlayerDied(G: GState, dead: PlayerId): void {
  if (G.seats[G.activeSeat] !== dead) return;
  // 'phaseBody' joins 'phase' in the filter as of 4.1b (skill-trigger-design
  // §2.2 split them): a body frame left on the stack would run the dead
  // player's draw or discard step on the way out.
  G.stack = G.stack.filter((f) => f.t !== 'phase' && f.t !== 'phaseBody');
  G.stack.unshift({ t: 'phase', phase: 'end' });
}
