import { describe, it, expect } from 'vitest';
import { endTurn, nextPhaseInTurn, resolvePhase, resolvePhaseBody } from '../../src/engine/phases.js';
import { makeGState } from './fixtures.js';
import type { Frame } from '../../src/engine/frames.js';
import type { GState } from '../../src/engine/state.js';

/** The stack reads bottom-first; every assertion below is about what happens
 * FIRST, so read it the way the pump will. */
function order(G: GState): Frame[] {
  return [...G.stack].reverse();
}

describe('nextPhaseInTurn', () => {
  it('walks the fixed order', () => {
    expect(nextPhaseInTurn('prep', [])).toBe('judge');
    expect(nextPhaseInTurn('judge', [])).toBe('draw');
    expect(nextPhaseInTurn('draw', [])).toBe('action');
    expect(nextPhaseInTurn('action', [])).toBe('discard');
    expect(nextPhaseInTurn('discard', [])).toBe('end');
  });

  it('skips phases listed in skipPhases (e.g. 乐不思蜀 skipping action)', () => {
    expect(nextPhaseInTurn('draw', ['action'])).toBe('discard');
  });
});

describe('resolvePhase (4.1b: a phase is [phase.start, phaseBody])', () => {
  // §2.2: resolvePhase used to do the phase's work immediately on pop, which
  // leaves nowhere for 突袭 ("in your draw phase you may skip drawing and take a
  // card from two other players instead") to run BEFORE the draw and cancel it.
  // The work moved into a second frame that re-reads live state when it pops.

  it('prep opens the turn: turn.start, then phase.start, then the body', () => {
    const G = makeGState();
    resolvePhase('prep', G);
    expect(order(G)).toEqual([
      { t: 'trigger', ev: { event: 'turn.start', player: '0' } },
      { t: 'trigger', ev: { event: 'phase.start', player: '0', phase: 'prep' } },
      { t: 'phaseBody', phase: 'prep' },
    ]);
  });

  it('prep re-derives the strike limit for the turn (咆哮 ⇒ Infinity folds in here)', () => {
    const G = makeGState();
    G.turnFlags.strikeLimit = 99; // stale value from a previous turn
    resolvePhase('prep', G);
    expect(G.turnFlags.strikeLimit).toBe(1); // no skills registered ⇒ the base
  });

  it('every other phase opens with phase.start, then the body — and no turn.start', () => {
    const G = makeGState();
    resolvePhase('draw', G);
    expect(order(G)).toEqual([
      { t: 'trigger', ev: { event: 'phase.start', player: '0', phase: 'draw' } },
      { t: 'phaseBody', phase: 'draw' },
    ]);
    expect(G.turnPhase).toBe('draw');
  });

  it('a phase in skipPhases is NOT ENTERED AT ALL — no phase.start, no body, no phase.end', () => {
    // 乐不思蜀. A skipped phase has no timing windows inside it; that is the
    // rule, and it is why the check lives here and not only in the body.
    const G = makeGState({ skipPhases: ['action'] });
    resolvePhase('action', G);
    expect(G.stack).toEqual([{ t: 'phase', phase: 'discard' }]);
  });

  it('每阶段限一次 counters are cleared on entering a phase, per-turn ones are not', () => {
    const G = makeGState();
    G.turnFlags['usedPhase.skill.x'] = true;
    G.turnFlags['used.skill.y'] = true;
    resolvePhase('draw', G);
    expect(G.turnFlags['usedPhase.skill.x']).toBeUndefined();
    expect(G.turnFlags['used.skill.y']).toBe(true);
  });
});

describe('resolvePhaseBody', () => {
  it('judge wraps each judgementZone card in a nullification window (LIFO), then ends the phase', () => {
    const G = makeGState({ activeSeat: 0, turnPhase: 'judge' });
    G.players['0'].judgementZone = ['lightning_as', 'indulgence_6h']; // lightning placed FIRST
    resolvePhaseBody('judge', G);

    // ⚠️ The timing trap (judgement-nullification-design §3): the 无懈可击 window
    // for a delayed trick opens HERE — at the start of the judge phase, before
    // the flip — not when the card was played. So the zone yields *windows*,
    // each guarding a {t:'judge'}, not bare judge frames.
    const windows = G.stack.filter((f) => f.t === 'effect');
    expect(windows).toHaveLength(2);
    for (const w of windows) {
      expect(w).toMatchObject({ t: 'effect', effectKey: 'nullify_window' });
      expect((w as { ctx: { protect: { t: string } } }).ctx.protect.t).toBe('judge');
    }

    // LIFO: the LAST card placed judges FIRST (后置入先结算), so 乐不思蜀 is on
    // top of the stack and 闪电 underneath it.
    const [first, second] = order(G) as { ctx: { protect: { card: string } } }[];
    expect(first.ctx.protect.card).toBe('indulgence_6h');
    expect(second.ctx.protect.card).toBe('lightning_as');

    // …and the phase.end fan-out + the next phase are at the bottom, so they
    // run last — after every judgement has resolved.
    expect(G.stack[1]).toEqual({
      t: 'trigger',
      ev: { event: 'phase.end', player: '0', phase: 'judge' },
    });
    expect(G.stack[0]).toEqual({ t: 'phase', phase: 'draw' });
  });

  it('draw pushes a {t:draw} primitive for the folded count, then ends the phase', () => {
    // The count is queries.drawCount (英姿 +1, 裸衣 −1), and the draw goes
    // through the primitive rather than a direct drawCards() call — so
    // card.gained is emitted from the one place that puts cards in a hand.
    const G = makeGState({ drawPile: ['a', 'b', 'c'], turnPhase: 'draw' });
    resolvePhaseBody('draw', G);
    expect(order(G)).toEqual([
      { t: 'draw', player: '0', count: 2 },
      { t: 'trigger', ev: { event: 'phase.end', player: '0', phase: 'draw' } },
      { t: 'phase', phase: 'action' },
    ]);
  });

  it('a phase skipped from INSIDE its own phase.start (突袭) does no work — but still ends', () => {
    const G = makeGState({ drawPile: ['a', 'b'], turnPhase: 'draw', skipPhases: ['draw'] });
    resolvePhaseBody('draw', G);
    // No {t:'draw'} — the skip was in place in time, which is the whole point
    // of splitting the body out of the phase.
    expect(order(G)).toEqual([
      { t: 'trigger', ev: { event: 'phase.end', player: '0', phase: 'draw' } },
      { t: 'phase', phase: 'action' },
    ]);
    expect(G.players['0'].hand).toEqual([]);
  });

  it('action pushes an act request and does not also end the phase (blocks — `pass` ends it)', () => {
    const G = makeGState({ turnPhase: 'action' });
    resolvePhaseBody('action', G);
    expect(G.stack).toEqual([{ t: 'request', req: { kind: 'act', playerId: '0' } }]);
  });

  it('discard ends the phase straight away when the hand is within the limit', () => {
    const G = makeGState({ turnPhase: 'discard' });
    G.players['0'].hp = 4;
    G.players['0'].hand = ['a', 'b'];
    resolvePhaseBody('discard', G);
    expect(order(G)).toEqual([
      { t: 'trigger', ev: { event: 'phase.end', player: '0', phase: 'discard' } },
      { t: 'phase', phase: 'end' },
    ]);
  });

  it('discard blocks on a request sized to the hand-limit overflow (current HP, not max)', () => {
    const G = makeGState({ turnPhase: 'discard' });
    G.players['0'].maxHp = 4;
    G.players['0'].hp = 2;
    G.players['0'].hand = ['a', 'b', 'c', 'd'];
    resolvePhaseBody('discard', G);
    expect(G.stack).toEqual([{ t: 'request', req: { kind: 'discard', playerId: '0', count: 2 } }]);
  });

  it('end fires phase.end and turn.end BEFORE the turn state is wiped', () => {
    // The ordering is the reason {t:'turnEnd'} exists as a frame at all: a
    // turn.end listener that reads a turn flag the engine has already reset
    // reads a lie (克己 reads whether a 杀 was used; 裸衣's flag is still true).
    const G = makeGState({ turnPhase: 'end' });
    G.turnFlags = { strikesPlayed: 1, strikeLimit: 1 };
    resolvePhaseBody('end', G);
    expect(order(G)).toEqual([
      { t: 'trigger', ev: { event: 'phase.end', player: '0', phase: 'end' } },
      { t: 'trigger', ev: { event: 'turn.end', player: '0' } },
      { t: 'turnEnd' },
    ]);
    expect(G.turnFlags.strikesPlayed).toBe(1); // not wiped yet
    expect(G.activeSeat).toBe(0); // not moved yet
  });
});

describe('endTurn', () => {
  it('resets per-turn flags/skips and hands off to the next living seat', () => {
    const G = makeGState();
    G.turnFlags = { strikesPlayed: 1, strikeLimit: 1, 'used.skill.x': true };
    G.skipPhases = ['action'];
    G.activeSeat = 0;
    endTurn(G);
    // Every limit counter and every {t:'flag'} a skill wrote goes with it.
    expect(G.turnFlags).toEqual({ strikesPlayed: 0, strikeLimit: 1 });
    expect(G.skipPhases).toEqual([]);
    expect(G.activeSeat).toBe(1);
    expect(G.stack).toEqual([{ t: 'phase', phase: 'prep' }]);
  });

  it('wraps back around to seat 0 after the last seat', () => {
    const G = makeGState();
    G.activeSeat = G.seats.length - 1;
    endTurn(G);
    expect(G.activeSeat).toBe(0);
  });
});
