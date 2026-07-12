// Task 7.2 — the soak. Plays whole games, end to end, through the real
// boardgame.io reducer, with the bot in test/playtest/bot.ts driving every seat.
//
//   npm run soak -w server                 # the default sweep (see below)
//   SOAK_GAMES=500 npm run soak -w server  # a long hunt
//   SOAK_SEED=1234 npm run soak -w server  # replay one exact game
//
// A default run is small enough to live in the normal suite (it runs on every
// `run-tests.bat`), because a soak that only runs when someone remembers to run
// it finds nothing. The knobs above are for hunting.
//
// WHAT IT ASSERTS. Not "the rules are right" — 495 unit tests already do that,
// one card and one skill at a time. This asserts the things that can only break
// when the whole machine runs at once, and that a unit test cannot see:
//
//   1. **Card conservation.** No card is created or destroyed, ever. Every zone,
//      every step. This is the invariant that catches a `moveCards` that took a
//      card out of a hand it wasn't in, or a reshuffle that lost the discard.
//   2. **Engine/framework sync.** `ctx.currentPlayer` and `ctx.activePlayers`
//      must agree with `G.pending` on EVERY step — not just at turn boundaries.
//      A drift here is a table where the player who is asked cannot answer.
//   3. **No zombie.** The engine never hands control back to the turn loop
//      (`act`/`discard`) with a living player at 0 hp — that means a dying window
//      was silently skipped. (Between `damage.after` and the dying check, a
//      living 0-hp player is CORRECT — 奸雄/反馈/刚烈/遗计 resolve right there —
//      which is why this is asserted against the request KIND, not a bare hp
//      check. See game.test.ts's TURN_LOOP_REQUESTS note.)
//   4. **No wedge.** Every game terminates, with a `gameOver` naming a legal
//      winning side and at least one winner. A game that runs past the step cap
//      is a wedge, and prints its seed and its last 30 requests.
//   5. **Every request is answerable.** The bot throws on a request kind it has
//      never seen (bot.ts's `default`) — the 6.4b bug class, now caught by a bot
//      instead of by a player sitting at a stalled table.

import { Client } from 'boardgame.io/dist/cjs/client.js';
import { describe, it, expect } from 'vitest';
import { ThreeKingdomsGame } from '../../src/bgio/game.js';
import { makeRng, type BgioRandomLike } from '../../src/bgio/rng.js';
import { initGame } from '../../src/engine/setup.js';
import { pump } from '../../src/engine/pump.js';
import { ALL_GENERAL_IDS, driveOneRequest, makeSeededRng, type BotClient, type BotView } from './bot.js';
import type { PlayerId } from '../../src/engine/state.js';

const GAMES = Number(process.env.SOAK_GAMES ?? 24);
const BASE_SEED = Number(process.env.SOAK_SEED ?? 0);
/** A real 4-player game is a few hundred requests. 20k is "this is never
 * finishing", not "this is a long game". */
const STEP_CAP = 20_000;

/** The whole deck, once. Every zone is counted every step against this. */
function totalCards(G: BotView): number {
  let n = G.drawPileCount + G.discardPile.length + G.revealed.length;
  // A judgement in flight is a real zone: the flipped card is lifted OUT of
  // the draw pile into G.judgement (engine/judgement.test.ts pins this), so a
  // census taken inside the retrial window — exactly where 鬼才's confirmSkill
  // blocks — is one short without it.
  if (G.judgement) n += 1;
  for (const p of Object.values(G.players)) {
    n += p.hand?.length ?? p.handCount ?? 0;
    n += Object.values(p.equipment).filter(Boolean).length;
    n += p.judgementZone.length;
  }
  return n;
}

/** The two requests that mean "the engine has finished resolving and is asking
 * the turn player what to do next" — see the header, and game.test.ts. */
const TURN_LOOP_REQUESTS = ['act', 'discard'];

interface GameResult {
  seed: number;
  numPlayers: number;
  generals: string[];
  steps: number;
  turns: number;
  winners: PlayerId[];
  condition: string;
  trace: string[];
}

/** One full game, deterministic in `seed`. Throws with the seed attached on any
 * violated invariant, so a failure is directly replayable. */
function playOneGame(seed: number): GameResult {
  const rng = makeSeededRng(seed);
  const numPlayers = 4 + rng.int(5); // 4..8 — every role split the game supports
  const generals = rng.shuffle(ALL_GENERAL_IDS).slice(0, numPlayers);

  // The real setup(), with a RANDOM general line-up rather than the default
  // first-N — otherwise the soak would replay the same four skills forever, and
  // Phase 4's whole point is the other thirty-six. Roles are left to the real
  // deal (they are random, and that is a dimension worth soaking too).
  const game = {
    ...ThreeKingdomsGame,
    // Pin boardgame.io's OWN rng too (deck shuffle, role deal): without this it
    // seeds from the clock, so the same soak seed played different games on
    // every run — failures were intermittent and SOAK_SEED couldn't actually
    // replay one. With it, a failure reproduces exactly.
    seed: String(seed),
    setup: ({ ctx, random }: { ctx: { numPlayers: number }; random: unknown }) => {
      const playerIds: PlayerId[] = Array.from({ length: ctx.numPlayers }, (_, i) => String(i));
      const engineRng = makeRng(random as BgioRandomLike);
      const generalIds: Record<PlayerId, string> = {};
      playerIds.forEach((id, i) => {
        generalIds[id] = generals[i];
      });
      const G = initGame({ playerIds, generalIds }, engineRng);
      pump(G, engineRng);
      return G;
    },
  };

  const client = Client({ game, numPlayers }) as unknown as BotClient;
  client.start();

  const first = client.getState();
  if (!first) throw new Error(`seed ${seed}: no initial state`);
  const deckSize = totalCards(first.G);

  const trace: string[] = [];
  let steps = 0;
  let turns = 0;
  let lastTurnPlayer = first.G.seats[first.G.activeSeat];

  for (;;) {
    const state = client.getState();
    if (!state) throw new Error(`seed ${seed}: state vanished after ${steps} steps`);
    const { G, ctx } = state;

    if (G.gameOver) {
      return {
        seed,
        numPlayers,
        generals,
        steps,
        turns,
        winners: G.gameOver.winners,
        condition: G.gameOver.condition,
        trace,
      };
    }

    // ── invariants, every single step ──────────────────────────────────────
    const fail = (msg: string): never => {
      throw new Error(
        `seed ${seed} (${numPlayers}p, step ${steps}): ${msg}\n` +
          `  generals: ${generals.join(', ')}\n` +
          `  pending: ${JSON.stringify(G.pending)}\n` +
          `  last 30: ${trace.slice(-30).join(' → ')}`,
      );
    };

    if (totalCards(G) !== deckSize) {
      fail(`cards created or destroyed: ${totalCards(G)} on the table, deck is ${deckSize}`);
    }
    if (!G.pending) fail('nothing is pending and the game is not over — the engine has stalled');

    const askedId = G.pending!.playerId ?? G.pending!.waitingOn!;
    if (!G.players[askedId].alive) fail(`the engine is asking a DEAD player (${askedId}) to act`);
    if (ctx.currentPlayer !== G.seats[G.activeSeat]) {
      fail(`bgio and the engine disagree on whose turn it is (${ctx.currentPlayer} vs ${G.seats[G.activeSeat]})`);
    }
    if (JSON.stringify(ctx.activePlayers) !== JSON.stringify({ [askedId]: G.pending!.kind })) {
      fail(
        `bgio's active stage does not match G.pending — the asked player cannot answer. ` +
          `activePlayers=${JSON.stringify(ctx.activePlayers)}`,
      );
    }
    for (const [id, p] of Object.entries(G.players)) {
      if (p.hp > p.maxHp) fail(`${id} is above max hp (${p.hp}/${p.maxHp})`);
      if (p.alive && p.hp <= 0 && TURN_LOOP_REQUESTS.includes(G.pending!.kind)) {
        fail(`ZOMBIE: ${id} is alive at ${p.hp} hp while the engine asks for '${G.pending!.kind}' — a dying window was skipped`);
      }
    }

    // ── drive ──────────────────────────────────────────────────────────────
    const turnPlayer = G.seats[G.activeSeat];
    if (turnPlayer !== lastTurnPlayer) {
      turns += 1;
      lastTurnPlayer = turnPlayer;
    }

    trace.push(driveOneRequest(client, rng));
    steps += 1;

    if (steps > STEP_CAP) {
      fail(`WEDGE: ${STEP_CAP} steps without an ending (${turns} turns) — the game is going nowhere`);
    }
  }
}

describe('7.2 — bot soak: whole games, end to end, through the real framework', () => {
  const results: GameResult[] = [];

  it(
    `plays ${GAMES} full games (4–8 players, random generals) with no invariant violated`,
    () => {
      for (let i = 0; i < GAMES; i++) {
        const result = playOneGame(BASE_SEED + i);
        results.push(result);

        // A finished game must have a legal terminal state — not just "it stopped".
        expect(result.winners.length, `seed ${result.seed}: game over with no winners`).toBeGreaterThan(0);
        expect(['lord', 'loyalist', 'rebel', 'traitor']).toContain(result.condition);
      }
    },
    // Generous: a 500-game hunt runs under this, and the default 24 is seconds.
    600_000,
  );

  it('actually played real games — a soak that ends instantly has tested nothing', () => {
    // A guard against the harness silently degrading (e.g. every game "won" on
    // step 3 because setup broke). These floors are far below a real game.
    const totalSteps = results.reduce((n, r) => n + r.steps, 0);
    const totalTurns = results.reduce((n, r) => n + r.turns, 0);
    expect(totalSteps / results.length).toBeGreaterThan(30);
    expect(totalTurns / results.length).toBeGreaterThan(3);
  });

  it('exercised Phase 4 — the bot said yes to optional skills and they fired', () => {
    // If no game in the whole sweep ever reached a skill prompt, the soak is
    // testing Phase 2 with extra steps, and this test is what tells you so.
    const everySkillRequest = results.flatMap((r) => r.trace).filter((label) => /confirmSkill|useSkill|guanxing|yiji|liuli|guicai|declareSuit|chooseOption|choosePlayer/.test(label));
    expect(everySkillRequest.length).toBeGreaterThan(0);
  });
});
