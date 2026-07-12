// Task 7.2 — the scripted playtester. See docs/handoff/7.2-playtest-soak.md.
//
// NOT a *.test.ts file on purpose (vitest must not run it as a suite) — this is
// the bot that `soak.test.ts` points at thousands of games.
//
// WHAT THIS IS FOR. 7.2 asks for "real games; fix rules edge-cases and UX
// friction as they surface". A human finds a wedged table in twenty minutes of
// play; a bot finds it in a second, and finds the one that only happens when
// 反馈 fires on the same damage that killed someone. So the bot's job is not to
// play WELL — it is to reach states no reasonable human would think to try, and
// to do it with a SEED so that when it finds one, the game replays exactly.
//
// THE DESIGN RULE THAT MAKES THIS HONEST: **the bot may only read what a real
// client can read.** It drives through `boardgame.io`'s own client, so every
// state it sees has been through `playerView` — no peeking at other hands, no
// reaching into `G.stack`. If the bot needs a fact the client isn't given, that
// is a finding about the client, not a licence to import the engine. The one
// exception is deliberate and marked: it reads `content/standard/*.json` (public
// data every client already ships) to know which effectKey a card has.
//
// HOW IT PICKS A MOVE. It proposes, the server disposes: the bot assembles a
// list of *plausible* moves, tries them in a shuffled order, and detects an
// INVALID_MOVE by watching `_stateID` fail to advance. That is on purpose —
// hand-rolling the full rules here would be writing a second engine (the thing
// engine-design §3 exists to prevent), and the INVALID_MOVE count is itself a
// signal: a legal-looking move the server rejects is worth reading twice.

import { cards, generals } from '@3k/shared';
import type { CardId, PlayerId } from '../../src/engine/state.js';

// ── the seeded RNG (mulberry32) ──────────────────────────────────────────────
// Deterministic and tiny. A failing seed is a bug report: `SOAK_SEED=1234 npm
// run soak` replays the exact game, move for move.

export interface Rng {
  next(): number;
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  chance(p: number): boolean;
}

export function makeSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    pick: <T,>(items: readonly T[]): T => items[int(items.length)],
    shuffle: <T,>(items: readonly T[]): T[] => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    chance: (p: number) => next() < p,
  };
}

// ── public data the bot is allowed to read (every client ships it) ───────────

const effectKeyOf = new Map<string, string>(cards.map((c) => [c.id, c.effectKey] as [string, string]));
const skillIdsOf = new Map<string, string[]>(
  generals.map((g) => [g.id, [...(g.skillIds ?? [])]] as [string, string[]]),
);

export const ALL_GENERAL_IDS: string[] = generals.map((g) => g.id);

/** Cards worth playing at somebody — the bot is aggressive on purpose: a game of
 * four bots who all pass is a game that never ends, and an unending game is a
 * false wedge. */
const AGGRESSIVE = new Set(['strike', 'duel', 'duress', 'barbarian_invasion', 'raining_arrows', 'lightning', 'indulgence']);

// ── the shape of what a client sees (playerView's output) ────────────────────

export interface BotPlayerView {
  hand?: CardId[];
  handCount?: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  generalId: string;
  equipment: Record<string, CardId | null>;
  judgementZone: CardId[];
}

export interface BotView {
  players: Record<PlayerId, BotPlayerView>;
  seats: PlayerId[];
  activeSeat: number;
  turnPhase: string;
  turnFlags: { strikesPlayed: number; strikeLimit: number; [k: string]: unknown };
  drawPileCount: number;
  discardPile: CardId[];
  revealed: CardId[];
  pending: (Record<string, unknown> & { kind: string; playerId?: PlayerId; waitingOn?: PlayerId }) | null;
  gameOver?: { winners: PlayerId[]; condition: string };
  log: { key: string; params?: Record<string, unknown> }[];
}

export interface BotClient {
  moves: Record<string, (...args: unknown[]) => void>;
  getState(): {
    G: BotView;
    ctx: { currentPlayer: string; activePlayers: Record<string, string> | null; numPlayers: number };
    _stateID: number;
  } | null;
  updatePlayerID(id: PlayerId): void;
  start(): void;
}

/** One proposed move: what to call, and with what. Tried in order until one of
 * them actually advances `_stateID`. */
interface Attempt {
  move: string;
  args: unknown[];
  label: string;
}

const livingOthers = (G: BotView, me: PlayerId): PlayerId[] =>
  G.seats.filter((id) => id !== me && G.players[id]?.alive);

const livingAll = (G: BotView): PlayerId[] => G.seats.filter((id) => G.players[id]?.alive);

/**
 * Everything the bot might do when asked to act. Ordered aggressive-first, then
 * shuffled within tiers by the caller — so the bot is violent enough to end a
 * game but random enough to wander into the corners.
 */
function actAttempts(G: BotView, me: PlayerId, rng: Rng): Attempt[] {
  const hand = G.players[me].hand ?? [];
  const legalTargets = (G.pending?.legalTargets ?? {}) as Record<CardId, PlayerId[]>;
  const attempts: Attempt[] = [];

  const distinct = [...new Set(hand)];
  const aggressive = distinct.filter((id) => AGGRESSIVE.has(effectKeyOf.get(id) ?? ''));
  const rest = distinct.filter((id) => !AGGRESSIVE.has(effectKeyOf.get(id) ?? ''));

  for (const cardId of [...rng.shuffle(aggressive), ...rng.shuffle(rest)]) {
    const key = effectKeyOf.get(cardId) ?? '?';
    const targets = legalTargets[cardId] ?? [];
    if (targets.length > 0) {
      // One random legal target (杀/决斗/顺手牵羊…), then the whole set (the AoE
      // and 桃园结义 shapes). The server's TargetSpec decides which is legal —
      // the bot does not re-derive the rules (that would be a second engine).
      attempts.push({ move: 'playCard', args: [cardId, [rng.pick(targets)]], label: `play ${key}` });
      if (targets.length > 1) {
        attempts.push({ move: 'playCard', args: [cardId, targets], label: `play ${key} (all)` });
      }
    }
    attempts.push({ move: 'playCard', args: [cardId, []], label: `play ${key} (no target)` });
  }

  // ACTIVE skills (制衡, 仁德, 苦肉, 青囊, 观星, 结姻, 反间, 离间…). The bot knows
  // which skills its general has from public data, and lets `useSkill` reject
  // anything it can't legally do right now (limit spent, wrong card count, no
  // legal target) — same propose-and-be-refused contract as a card.
  //
  // Attempted only SOMETIMES, and with only a few shapes: every refused attempt
  // is a real INVALID_MOVE through boardgame.io's reducer (which logs), and a bot
  // that brute-forces every (skill × cost × target) shape on every single `act`
  // buries the run in console noise and finds nothing extra — over thousands of
  // turns, a 1-in-3 chance of trying each skill covers the space just as well.
  const skillAttempts: Attempt[] = [];
  if (rng.chance(0.34)) {
    const skillIds = skillIdsOf.get(G.players[me].generalId) ?? [];
    const others = livingOthers(G, me);
    const cardPool = rng.shuffle(hand);
    for (const skillId of rng.shuffle(skillIds)) {
      const cost: CardId[] = rng.pick([[], cardPool.slice(0, 1), cardPool.slice(0, 2)]);
      const targets: PlayerId[] = rng.pick([
        [],
        others.length > 0 ? [rng.pick(others)] : [],
        others.length > 1 ? rng.shuffle(others).slice(0, 2) : [],
        [me],
      ]);
      skillAttempts.push({ move: 'useSkill', args: [skillId, cost, targets], label: `useSkill ${skillId}` });
    }
  }

  // Skills FIRST when this turn rolled them (they are only tried a third of the
  // time, so they must not then be crowded out by a big hand), cards after, and
  // the whole list capped: `pass` always lands, so a long tail of doomed attempts
  // buys nothing but console noise from boardgame.io's INVALID_MOVE logging.
  const capped = [...skillAttempts, ...attempts].slice(0, 12);
  capped.push({ move: 'pass', args: [], label: 'pass' });
  return capped;
}

/**
 * Answer whatever the engine is blocked on. Returns a short label for the trace
 * (a failing soak prints the last N of these, which is usually enough to see the
 * shape of the wedge without a debugger).
 *
 * Every request kind in @3k/shared's THREE_KINGDOMS_STAGE_MOVES is handled. A
 * kind that reaches `default` is a NEW request the bot has never seen — that
 * throws loudly rather than being skipped, because a request no client knows how
 * to answer is exactly the class of bug 6.4b was (a silently wedged table).
 */
export function driveOneRequest(client: BotClient, rng: Rng): string {
  const peek = client.getState();
  if (!peek) throw new Error('bot: no state');
  const who = peek.G.pending?.playerId ?? peek.G.pending?.waitingOn;
  if (!who) throw new Error('bot: nothing pending');

  // Read the game as the player being asked — playerView gives you your own hand
  // and nobody else's, so the bot must BE that player to answer as them.
  client.updatePlayerID(who);
  const state = client.getState();
  if (!state) throw new Error('bot: no state after updatePlayerID');
  const { G } = state;
  const pending = G.pending!;
  const me = pending.playerId!;
  const hand = G.players[me].hand ?? [];

  const before = state._stateID;
  const tryMove = (a: Attempt): boolean => {
    client.moves[a.move](...a.args);
    return (client.getState()?._stateID ?? before) !== before;
  };
  /** Try each attempt until one actually lands. Returns its label. */
  const tryAll = (attempts: Attempt[], fallback?: Attempt): string => {
    for (const a of attempts) {
      if (tryMove(a)) return a.label;
    }
    if (fallback && tryMove(fallback)) return `${fallback.label} (fallback)`;
    throw new Error(
      `bot: every move was refused for pending '${pending.kind}' (player ${me}). ` +
        `Tried: ${attempts.map((a) => a.label).join(', ')}. ` +
        `This is a WEDGE — the engine is blocked on a request nobody can answer.`,
    );
  };

  switch (pending.kind) {
    case 'act':
      return tryAll(actAttempts(G, me, rng));

    case 'discard': {
      const n = pending.count as number;
      return tryAll([{ move: 'discard', args: [rng.shuffle(hand).slice(0, n)], label: `discard ${n}` }]);
    }

    // 杀→闪, 决斗→杀, 濒死→桃, trick→无懈可击 — all one protocol (§5). The bot
    // supplies when it can and declines when it can't; note it tries EVERY card,
    // not just the obvious one, because 武圣/龙胆/倾国/急救 make a red K a 杀.
    case 'demandCard': {
      const kind = pending.demandKind as string;
      const count = (pending.count as number) ?? 1;
      const obvious = hand.filter((id) => effectKeyOf.get(id) === kind);
      const attempts: Attempt[] = [];
      if (obvious.length >= count) {
        attempts.push({ move: 'supplyCards', args: [obvious.slice(0, count)], label: `supply ${kind}` });
      }
      // 视为 conversions: let the server's cardsAs fold decide.
      for (const combo of combinations(rng.shuffle(hand), count).slice(0, 8)) {
        attempts.push({ move: 'supplyCards', args: [combo], label: `supply ${kind} (as)` });
      }
      // Declining is ALWAYS legal, and is the one answer that can never wedge —
      // hence the fallback rather than another attempt.
      return tryAll(attempts, { move: 'supplyCards', args: [null], label: `decline ${kind}` });
    }

    // The bot says YES most of the time: a bot that always declines never
    // exercises a single Phase 4 skill, which would make this whole harness a
    // very expensive way to re-test Phase 2.
    case 'confirmSkill':
      return tryAll([
        { move: 'respondSkill', args: [rng.chance(0.75)], label: 'confirmSkill' },
      ]);

    case 'orderTriggers':
      return tryAll([
        { move: 'orderTriggers', args: [rng.shuffle(pending.triggerIds as string[])], label: 'orderTriggers' },
      ]);

    // Opaque SLOTS, never ids (3.1 §5) — the bot picks a position, exactly like a
    // human clicking a face-down card.
    case 'chooseCard': {
      const choices = pending.choices as unknown[];
      return tryAll(rng.shuffle(choices).map((slot) => ({ move: 'chooseCard', args: [slot], label: 'chooseCard' })));
    }

    case 'chooseOption': {
      const options = pending.options as { id: string }[];
      return tryAll(
        rng.shuffle(options).map((o) => ({ move: 'chooseOption', args: [o.id], label: `chooseOption ${o.id}` })),
      );
    }

    // null is a legal answer — 突袭 takes from *up to* two players.
    case 'choosePlayer': {
      const candidates = pending.candidates as PlayerId[];
      const attempts = rng.shuffle(candidates).map((c) => ({
        move: 'choosePlayer',
        args: [c],
        label: 'choosePlayer',
      }));
      if (rng.chance(0.15)) attempts.unshift({ move: 'choosePlayer', args: [null], label: 'choosePlayer (stop)' });
      return tryAll(attempts, { move: 'choosePlayer', args: [null], label: 'choosePlayer (stop)' });
    }

    // 观星 — a permutation of exactly the cards offered.
    case 'guanxing':
      return tryAll([
        { move: 'arrangeCards', args: [rng.shuffle(pending.cards as CardId[])], label: 'guanxing' },
      ]);

    // 鬼才 — one of your own cards, or decline (which is legal even though the
    // optional trigger already said yes).
    case 'guicaiRetrial': {
      const attempts = hand.length > 0 && rng.chance(0.8)
        ? [{ move: 'submitRetrial', args: [rng.pick(hand)], label: 'guicai retrial' }]
        : [];
      return tryAll(attempts, { move: 'submitRetrial', args: [null], label: 'guicai decline' });
    }

    // 遗计 — every offered card must be placed on a living seat (self is legal).
    case 'yijiDistribute': {
      const offered = pending.cards as CardId[];
      const alive = livingAll(G);
      const assignments = offered.map((cardId) => ({ cardId, target: rng.pick(alive) }));
      return tryAll([{ move: 'distributeCards', args: [assignments], label: 'yiji distribute' }]);
    }

    // 流离 — discard one of your own cards AND name a new target. There is no
    // decline: the confirmSkill was the decline.
    case 'liuliRedirect': {
      const candidates = pending.candidates as PlayerId[];
      const attempts: Attempt[] = [];
      for (const card of rng.shuffle(hand)) {
        for (const target of rng.shuffle(candidates)) {
          attempts.push({ move: 'redirectStrike', args: [card, target], label: 'liuli redirect' });
        }
      }
      return tryAll(attempts);
    }

    case 'declareSuit':
      return tryAll([
        {
          move: 'declareSuit',
          args: [rng.pick(['clubs', 'spades', 'diamonds', 'hearts'])],
          label: 'declareSuit',
        },
      ]);

    default:
      throw new Error(
        `bot: unknown request kind '${pending.kind}'. A request no client knows how to answer ` +
          `wedges the table — this is the 6.4b bug class. Add a case here AND a prompt in ` +
          `client/src/game/prompts.ts.`,
      );
  }
}

/** All k-sized combinations, capped — used to let the server's cardsAs fold
 * decide whether two hand cards can be a 杀 (丈八蛇矛) or a red one can (武圣). */
function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k <= 0) return [[]];
  if (k > items.length) return [];
  const out: T[][] = [];
  const walk = (start: number, acc: T[]) => {
    if (out.length >= 16) return;
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}
