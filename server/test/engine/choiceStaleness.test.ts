// Task 7.2, soak finding #1 — the stale-`choices` wedge.
//
// THE BUG (found by the bot soak on its first run, seed-reproducible; no unit
// test could have caught it, and one nearly did — see the note at the bottom).
//
// A multi-round discard — 刚烈's two cards, 寒冰剑's two, 贯石斧's two — returns,
// from ONE resolve() call, both the {t:'moveCards'} for the card just picked AND
// the next {t:'request'} asking for the next one. resolve() may never mutate G
// (engine-design §3), so it necessarily builds that request's `choices` against a
// hand that has not yet lost the card it is about to lose.
//
// By the time the request frame POPS, the moveCards has applied. The slots now
// describe a hand that no longer exists.
//
//   * Usually harmless: one extra slot at the end that resolves to nothing.
//   * FATAL when the victim holds exactly ONE card: round two offers slot 0, slot
//     0 resolves to nothing, every possible answer is INVALID_MOVE — and the game
//     hangs forever on a request that nobody, human or bot, can answer.
//
// THE FIX (engine/pump.ts's 'request' case): re-validate a chooseCard's `choices`
// against LIVE state at pop time, exactly as U1 already does for an `act`
// request's `legalTargets`, and skip the request entirely when nothing is left to
// point at. The pusher cannot know what will be true at pop time, so the pusher
// must not be the one to decide.

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer, identityRng } from './fixtures.js';
import { pump, pushFrames } from '../../src/engine/pump.js';
import { resolveSlot } from '../../src/engine/cardChoice.js';
import { ganglieDiscard } from '../../src/content/skills/ganglie.js';
import { frostBladeDiscardFrames } from '../../src/content/effects/frostBlade.js';
import type { GState } from '../../src/engine/state.js';

const handOf = (G: GState, id: string) => G.players[id].hand;

describe('刚烈 — the discard-two that wedged the table', () => {
  it('does NOT ask for a second card when the source had only one (the wedge)', () => {
    // 夏侯惇 (0) judged non-Heart; the damage source (1) must discard two hand
    // cards but holds exactly one. Round two is where the table used to hang.
    const G = makeGState({
      players: { '0': makePlayer('0'), '1': makePlayer('1', { hand: ['strike_2c'] }) },
    });

    // This is what the chooseCard move produces on the way back in: the answer
    // (`chosen`) applied to the resume ctx, with one card still owed.
    const frames = ganglieDiscard.resolve(G, {
      source: '1',
      remaining: 2,
      chosen: 'strike_2c',
      chosenZone: { z: 'hand', player: '1' },
    });
    // The effect is doing nothing wrong: it cannot see the future, so it offers
    // the hand it can see — which still holds the card the frame above is about
    // to discard.
    expect(frames.some((f) => f.t === 'request')).toBe(true);

    pushFrames(G, frames);
    pump(G, identityRng);

    expect(handOf(G, '1')).toEqual([]); // the card was paid
    expect(G.discardPile).toContain('strike_2c');
    // THE ASSERTION THAT FAILS WITHOUT THE FIX: the engine asked for a second
    // card out of an empty hand, and no answer to that request exists.
    expect(G.pending).toBeNull();
  });

  it('offers exactly the cards that are actually left, with the indices they actually have', () => {
    const G = makeGState({
      players: { '0': makePlayer('0'), '1': makePlayer('1', { hand: ['strike_2c', 'peach_3h'] }) },
    });

    pushFrames(
      G,
      ganglieDiscard.resolve(G, {
        source: '1',
        remaining: 2,
        chosen: 'strike_2c',
        chosenZone: { z: 'hand', player: '1' },
      }),
    );
    pump(G, identityRng);

    // One card left, so exactly one slot — not the two the stale snapshot held.
    expect(G.pending?.kind).toBe('chooseCard');
    expect(G.pending?.choices).toEqual([{ z: 'hand', index: 0 }]);
    // ...and that slot must name the card that survived, not the one that left:
    // the indices shifted when the discard applied, and re-deriving at pop time
    // is what keeps them honest.
    expect(resolveSlot(G, '1', { z: 'hand', index: 0 })?.cardId).toBe('peach_3h');
  });
});

describe('寒冰剑 — the same shape, on the TARGET\'s cards', () => {
  it('stops asking once the target has nothing left, rather than asking for the impossible', () => {
    const G = makeGState({
      players: { '0': makePlayer('0'), '1': makePlayer('1', { hand: ['dodge_2h1'] }) },
    });

    pushFrames(
      G,
      frostBladeDiscardFrames(G, {
        owner: '0',
        target: '1',
        remaining: 2,
        chosen: 'dodge_2h1',
        chosenZone: { z: 'hand', player: '1' },
      }),
    );
    pump(G, identityRng);

    expect(handOf(G, '1')).toEqual([]);
    expect(G.pending).toBeNull();
  });
});

describe('the invariant, stated once', () => {
  it('never leaves a chooseCard pending whose choices cannot be resolved', () => {
    // The general form of the wedge, and the thing pump.ts's 'request' case now
    // guarantees: if G.pending is a chooseCard, at least one of its slots must
    // resolve against LIVE state — otherwise the engine is blocked on a question
    // with no legal answer.
    const G = makeGState({
      players: { '0': makePlayer('0'), '1': makePlayer('1', { hand: ['strike_2c'] }) },
    });
    pushFrames(
      G,
      ganglieDiscard.resolve(G, {
        source: '1',
        remaining: 2,
        chosen: 'strike_2c',
        chosenZone: { z: 'hand', player: '1' },
      }),
    );
    pump(G, identityRng);

    if (G.pending?.kind === 'chooseCard') {
      const target = G.pending.target as string;
      const choices = G.pending.choices as Parameters<typeof resolveSlot>[2][];
      expect(choices.some((slot) => resolveSlot(G, target, slot) !== null)).toBe(true);
    }
  });
});

// ── postscript, worth reading before "simplifying" any of the above ──────────
//
// 3.7's handoff (§3.2) already SAW this. Two of its test files originally
// asserted the discarded card would be gone from the second request's choices,
// found it still there, and corrected the tests — concluding, reasonably, that
// this was fine because "by the time the SECOND real request goes out to a
// player, the pump has applied the first moveCards and the live hand really has
// shrunk."
//
// That reasoning was right about the HAND and wrong about the REQUEST. The hand
// does shrink — but the request frame is still carrying the slot list that was
// computed before it did, and that list is what goes out on the wire. A test
// that pins observed behaviour cannot tell you the observed behaviour is a bug;
// only playing the game can. That is what the soak is for.
