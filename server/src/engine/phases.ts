// The 6 turn phases (docs/three-kingdoms-plan.md §2, docs/engine-design.md
// §7). This is `G.turnPhase` + `{t:'phase'}` frames, NOT boardgame.io
// `phases` — each turn contains six sub-phases, so the framework's
// phase system is the wrong tool (engine-design §7).
//
// Task 4.1b split each phase into TWO frames (skill-trigger-design §2.2):
//
//     {t:'phase'}  →  [ {t:'trigger', phase.start}, {t:'phaseBody'} ]
//
// because 突袭 ("in your draw phase you may skip drawing and take a card from
// two other players instead") must run BEFORE the draw and CANCEL it. Doing the
// phase's work immediately on pop — as `resolvePhase` used to — leaves nowhere
// for that to happen. The body re-reads live state when IT pops, so a
// {t:'skipPhase'} pushed by a phase.start listener is already in place in time.
//
// This module must not import boardgame.io — see docs/engine-design.md §8.

import type { GState, PlayerId, TurnPhase } from './state.js';
import type { CardId } from './state.js';
import type { Frame } from './frames.js';
import { handLimitOverflow } from './deck.js';
import { getCard } from './cardIndex.js';
import { clearPhaseLimits } from './limits.js';
import { drawCount, strikeLimit } from './queries.js';
import { pushFrames } from './stack.js';
import { nullifyWindowFrame } from '../content/effects/nullifyWindow.js';

/**
 * What happens to a delayed trick whose judgement gets nullified
 * (docs/judgement-nullification-design.md §2.4) — the ruling everyone gets
 * wrong, and the reason nullify windows carry an `onNullified` frame at all:
 *
 *   乐不思蜀 → discarded, no judgement, action phase not skipped
 *   闪电    → NOT discarded; it travels on to the next player's judgement zone
 *
 * The travel itself is the `lightning_pass` effect, which task 3.4 writes
 * along with the card. Returning `undefined` (the default) means "cancelled ⇒
 * nothing happens", which is right for every non-delayed trick.
 */
function delayedTrickOnNullified(
  target: PlayerId,
  card: CardId,
  effectKey: string,
): Frame | undefined {
  if (effectKey === 'lightning') {
    return { t: 'effect', effectKey: 'lightning_pass', ctx: { owner: target, card } };
  }
  return {
    t: 'moveCards',
    cards: [card],
    from: { z: 'judgementZone', player: target },
    to: { z: 'discard' },
  };
}

const PHASE_ORDER: readonly TurnPhase[] = ['prep', 'judge', 'draw', 'action', 'discard', 'end'];

/** 摸牌阶段: draw 2 cards (plan §2). 英姿 (+1) / 裸衣 (−1) fold on top of it
 * through queries.drawCount — never by editing this constant. */
const DRAW_PHASE_COUNT = 2;

/** 出牌阶段: one 杀 per turn (plan §2). 咆哮 (⇒ Infinity) / 诸葛连弩 fold on top
 * through queries.strikeLimit, re-derived at the start of every turn. */
const BASE_STRIKE_LIMIT = 1;

/** Exported for the bgio adapter (task 2.3): once a move answers an
 * 'act'/'discard' request, it needs to know what phase comes next without
 * duplicating the phase-order knowledge that belongs here. */
export function nextPhaseInTurn(current: TurnPhase, skip: readonly TurnPhase[]): TurnPhase {
  let idx = PHASE_ORDER.indexOf(current);
  do {
    idx += 1;
    if (idx >= PHASE_ORDER.length) {
      throw new Error(`nextPhaseInTurn: fell off the end of the phase order after '${current}'`);
    }
  } while (skip.includes(PHASE_ORDER[idx]));
  return PHASE_ORDER[idx];
}

/** The living seat index that follows `seat`, wrapping around. Dead seats
 * are skipped but stay in G.seats (distance is measured over living seats
 * only — task 2.5). */
function nextLivingSeat(G: GState, seat: number): number {
  const n = G.seats.length;
  for (let step = 1; step <= n; step++) {
    const candidate = (seat + step) % n;
    if (G.players[G.seats[candidate]]?.alive) return candidate;
  }
  throw new Error('nextLivingSeat: no living players left — the game should have ended already (task 5.x)');
}

/** The pair every phase ends with: fan out `phase.end`, then move on. Both
 * frames, always together — `pass` and `discard` (the two moves that end a
 * phase from outside this module) push exactly this. */
export function endOfPhaseFrames(G: GState, phase: TurnPhase, player: PlayerId): Frame[] {
  return [
    { t: 'trigger', ev: { event: 'phase.end', player, phase } },
    { t: 'phase', phase: nextPhaseInTurn(phase, G.skipPhases) },
  ];
}

/**
 * Enters a phase: set G.turnPhase, fan out `phase.start`, then run the body.
 *
 * A phase in `G.skipPhases` (乐不思蜀 on the action phase, 克己 on the discard
 * phase) is NOT ENTERED AT ALL — no phase.start, no body, no phase.end. That is
 * the rule: a skipped phase has no timing windows inside it. (突袭 is the other
 * shape — a skip declared from *inside* the draw phase's own phase.start — and
 * it is `resolvePhaseBody` that catches that one.)
 */
export function resolvePhase(phase: TurnPhase, G: GState): void {
  if (G.skipPhases.includes(phase)) {
    G.stack.push({ t: 'phase', phase: nextPhaseInTurn(phase, G.skipPhases) });
    return;
  }

  G.turnPhase = phase;
  clearPhaseLimits(G); // 每阶段限一次 counters (skill-trigger-design §3.5)

  const activePlayerId = G.seats[G.activeSeat];
  if (!G.players[activePlayerId]) throw new Error(`resolvePhase: no player in seat ${G.activeSeat}`);

  const frames: Frame[] = [];
  if (phase === PHASE_ORDER[0]) {
    // The turn's own opening. strikeLimit is re-derived here rather than being
    // a constant in turnFlags: 咆哮 makes it Infinity for 张飞's whole turn, and
    // a 诸葛连弩 equipped mid-turn is *not* meant to raise it retroactively.
    G.turnFlags.strikeLimit = strikeLimit(G, activePlayerId, BASE_STRIKE_LIMIT);
    frames.push({ t: 'trigger', ev: { event: 'turn.start', player: activePlayerId } });
  }
  frames.push({ t: 'trigger', ev: { event: 'phase.start', player: activePlayerId, phase } });
  frames.push({ t: 'phaseBody', phase });
  pushFrames(G, frames);
}

/**
 * The phase's actual work, popped AFTER its phase.start listeners have run and
 * fully drained. Re-reads live state: if one of those listeners skipped this
 * very phase (突袭 skipping the draw it is standing in), the body does nothing —
 * but the phase still *happened*, so phase.end still fires.
 *
 * 'action' and 'discard' can push a `{t:'request'}` frame and *return* without
 * pushing the end-of-phase pair; the pump then blocks (G.pending is set).
 * Continuing after that answer is the answering move's job (`pass`/`discard` in
 * the bgio adapter push `endOfPhaseFrames`) — not a `{t:'resume'}` frame:
 * `resume` is for continuing an *effect*, and "what happens after this answer"
 * is plain phase bookkeeping, not game-rule logic.
 */
export function resolvePhaseBody(phase: TurnPhase, G: GState): void {
  const activePlayerId = G.seats[G.activeSeat];
  const player = G.players[activePlayerId];
  if (!player) throw new Error(`resolvePhaseBody: no player in seat ${G.activeSeat}`);

  // 突袭/克己-shaped: skipped from inside this phase's own phase.start window.
  const skipped = G.skipPhases.includes(phase);

  if (!skipped) {
    switch (phase) {
      case 'prep':
        // 准备阶段. 观星/洛神 hang off phase.start(prep) — there is no body.
        break;

      case 'judge': {
        // 判定阶段: resolve delayed tricks LIFO — the most recently placed card
        // judges first (engine-design §4). judgementZone is stored oldest-first
        // and pushFrames preserves narrative order, so walking it in reverse is
        // what puts the newest card first.
        //
        // ⚠️ THE TIMING TRAP (judgement-nullification-design §3): the 无懈可击
        // window for a DELAYED trick opens HERE — at the start of the victim's
        // judge phase, BEFORE the card is flipped — and nowhere else. A naive
        // implementation opens it when the trick is played, and every delayed
        // trick in the game becomes un-nullifiable in practice.
        //
        // What "nullified" means is card-specific, which is why the window
        // carries an onNullified frame: a nullified 乐不思蜀 is discarded, but a
        // nullified 闪电 is NOT — it travels on exactly as if the judgement had
        // missed. Both are filled in by task 3.4, which owns those two cards.
        const frames: Frame[] = [];
        for (const card of [...player.judgementZone].reverse()) {
          const effectKey = getCard(card).effectKey;
          frames.push(
            nullifyWindowFrame(
              {
                t: 'judge',
                target: activePlayerId,
                reasonKey: `judge.${effectKey}`,
                onResult: `${effectKey}_result`,
                card,
              },
              `nullify.${effectKey}`,
              delayedTrickOnNullified(activePlayerId, card, effectKey),
            ),
          );
        }
        pushFrames(G, [...frames, ...endOfPhaseFrames(G, phase, activePlayerId)]);
        return;
      }

      case 'draw':
        // 摸牌阶段. The count is a fold (英姿 +1, 裸衣 −1), and the draw is the
        // {t:'draw'} primitive rather than a direct drawCards() call — so that
        // `card.gained` is emitted from the one place that ever moves cards
        // into a hand.
        pushFrames(G, [
          { t: 'draw', player: activePlayerId, count: drawCount(G, activePlayerId, DRAW_PHASE_COUNT) },
          ...endOfPhaseFrames(G, phase, activePlayerId),
        ]);
        return;

      case 'action':
        // 出牌阶段: give the active player the floor. The bgio adapter maps this
        // to the 'act' stage; `pass` is what ends the phase.
        G.stack.push({ t: 'request', req: { kind: 'act', playerId: activePlayerId } });
        return;

      case 'discard': {
        // 弃牌阶段: discard down to hand limit = *current* HP, not max (§7).
        const overflow = handLimitOverflow(G, activePlayerId);
        if (overflow > 0) {
          G.stack.push({
            t: 'request',
            req: { kind: 'discard', playerId: activePlayerId, count: overflow },
          });
          return;
        }
        break;
      }

      case 'end':
        break;
    }
  }

  if (phase === 'end') {
    // 结束阶段. turn.end fires AFTER phase.end(end) and BEFORE turnFlags /
    // skipPhases are reset and activeSeat moves — so the reset cannot live
    // here; it is {t:'turnEnd'}, which pops once both fan-outs have drained.
    pushFrames(G, [
      { t: 'trigger', ev: { event: 'phase.end', player: activePlayerId, phase } },
      { t: 'trigger', ev: { event: 'turn.end', player: activePlayerId } },
      { t: 'turnEnd' },
    ]);
    return;
  }

  pushFrames(G, endOfPhaseFrames(G, phase, activePlayerId));
}

/**
 * Close the turn: wipe the turn-scoped state (turnFlags — including every
 * engine-enforced limit counter and every {t:'flag'} a skill wrote — and
 * skipPhases), hand off to the next living player, and open their prep phase.
 *
 * Deliberately NOT part of the end phase's body: every `turn.end` listener must
 * see the turn's flags intact (克己 reads whether a 杀 was used; 裸衣's flag is
 * still true), and the seat-order tiebreak for that very fan-out is measured
 * from the player whose turn is ending.
 */
export function endTurn(G: GState): void {
  G.turnFlags = { strikesPlayed: 0, strikeLimit: BASE_STRIKE_LIMIT };
  G.skipPhases = [];
  G.activeSeat = nextLivingSeat(G, G.activeSeat);
  G.stack.push({ t: 'phase', phase: 'prep' });
}
