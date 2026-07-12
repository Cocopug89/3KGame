// Task 7.2 — the bot's own tripwire.
//
// `soak.test.ts` is only as good as the bot: a bot that can't answer a request
// kind reports it as a WEDGE, and a bot that answers it with the wrong move name
// reports it as an INVALID_MOVE storm. Both look like engine bugs and are not.
//
// So this drives `driveOneRequest` against a FAKE client, once per request kind,
// and asserts two things:
//
//   1. every stage in @3k/shared's THREE_KINGDOMS_STAGE_MOVES gets answered —
//      driven off the shared map, so a NEW request kind fails here the day it
//      lands, not three hours into a soak run;
//   2. the move it answers with is one the server actually accepts in that stage
//      (again, per the shared map) — a typo'd move name is otherwise invisible,
//      because boardgame.io silently ignores an unknown move.
//
// This is the server-side twin of 6.4b's client tripwire ("every stage must
// produce a prompt"), and it exists for the same reason: a request nobody can
// answer is a table that stalls forever.

import { describe, it, expect } from 'vitest';
import { THREE_KINGDOMS_STAGE_MOVES } from '@3k/shared';
import { driveOneRequest, makeSeededRng, type BotClient, type BotView } from './bot.js';

/** The one stage the soak does not drive: general selection is opt-in setupData
 * (task 5.2) and the soak deals generals directly, so the bot never meets it.
 * Named explicitly rather than silently skipped. */
const NOT_DRIVEN = new Set(['chooseGeneral']);

function fakeView(pending: Record<string, unknown> & { kind: string; playerId: string }): BotView {
  const player = (over: Partial<BotView['players'][string]> = {}) => ({
    hand: ['strike_2c', 'peach_3h'],
    hp: 3,
    maxHp: 4,
    alive: true,
    generalId: 'cao_cao',
    equipment: { weapon: null, armour: null, plusHorse: null, minusHorse: null },
    judgementZone: [],
    ...over,
  });
  return {
    players: { '0': player(), '1': player({ generalId: 'guan_yu' }), '2': player({ generalId: 'da_qiao' }) },
    seats: ['0', '1', '2'],
    activeSeat: 0,
    turnPhase: 'action',
    turnFlags: { strikesPlayed: 0, strikeLimit: 1 },
    drawPileCount: 40,
    discardPile: [],
    revealed: [],
    pending,
    log: [],
  };
}

/** Records what the bot called, and pretends every move was accepted (the bot
 * detects INVALID_MOVE by watching _stateID, so "accepted" = bump it). */
function fakeClient(view: BotView) {
  const calls: { move: string; args: unknown[] }[] = [];
  let stateID = 0;
  const moves = new Proxy(
    {},
    {
      get: (_t, name: string) => (...args: unknown[]) => {
        calls.push({ move: name, args });
        stateID += 1;
      },
    },
  ) as Record<string, (...args: unknown[]) => void>;

  const client: BotClient = {
    moves,
    getState: () => ({
      G: view,
      ctx: { currentPlayer: '0', activePlayers: { [view.pending!.playerId as string]: view.pending!.kind }, numPlayers: 3 },
      _stateID: stateID,
    }),
    updatePlayerID: () => {},
    start: () => {},
  };
  return { client, calls };
}

/** A plausible payload for each request kind — the same shape the engine builds
 * (see the effect/skill that raises it). */
const PENDING_BY_KIND: Record<string, Record<string, unknown> & { kind: string; playerId: string }> = {
  act: {
    kind: 'act',
    playerId: '0',
    legalTargets: { strike_2c: ['1', '2'], peach_3h: [] },
  },
  discard: { kind: 'discard', playerId: '0', count: 1 },
  demandCard: { kind: 'demandCard', playerId: '0', demandKind: 'dodge', count: 1, reasonKey: 'demand.dodge' },
  confirmSkill: { kind: 'confirmSkill', playerId: '0', triggerId: 'skill.jianxiong', labelKey: 'skill.jianxiong.name' },
  orderTriggers: { kind: 'orderTriggers', playerId: '0', triggerIds: ['skill.a', 'skill.b'] },
  chooseCard: {
    kind: 'chooseCard',
    playerId: '0',
    target: '1',
    choices: [
      { z: 'hand', index: 0 },
      { z: 'equip', cardId: 'zhuge_crossbow_1c' },
    ],
  },
  chooseOption: {
    kind: 'chooseOption',
    playerId: '0',
    options: [
      { id: 'discard_two', labelKey: 'option.ganglie.discard_two' },
      { id: 'take_damage', labelKey: 'option.ganglie.take_damage' },
    ],
  },
  choosePlayer: { kind: 'choosePlayer', playerId: '0', candidates: ['1', '2'] },
  guanxing: { kind: 'guanxing', playerId: '0', cards: ['strike_2c', 'peach_3h'] },
  guicaiRetrial: { kind: 'guicaiRetrial', playerId: '0', reasonKey: 'skill.guicai' },
  yijiDistribute: { kind: 'yijiDistribute', playerId: '0', cards: ['strike_2c', 'peach_3h'] },
  liuliRedirect: { kind: 'liuliRedirect', playerId: '0', candidates: ['2'] },
  declareSuit: { kind: 'declareSuit', playerId: '0', reasonKey: 'skill.fanjian' },
};

const DRIVEN_STAGES = Object.keys(THREE_KINGDOMS_STAGE_MOVES).filter((s) => !NOT_DRIVEN.has(s));

describe('the soak bot answers every request the server can raise', () => {
  it('has a payload fixture for every stage in the shared map — a new request kind fails HERE first', () => {
    expect(Object.keys(PENDING_BY_KIND).sort()).toEqual([...DRIVEN_STAGES].sort());
  });

  for (const stage of DRIVEN_STAGES) {
    it(`answers '${stage}' with a move that stage actually accepts`, () => {
      const view = fakeView(PENDING_BY_KIND[stage]);
      const { client, calls } = fakeClient(view);

      const label = driveOneRequest(client, makeSeededRng(7));

      expect(label, `the bot returned no trace label for '${stage}'`).toBeTruthy();
      expect(calls.length, `the bot made no move for '${stage}'`).toBeGreaterThan(0);
      // Every move it tried must be one this stage accepts. (It may try several —
      // it proposes and lets the server dispose — but it must never fire a move
      // into a stage that has never heard of it: boardgame.io drops those
      // silently, which would look like a wedge.)
      const accepted = THREE_KINGDOMS_STAGE_MOVES[stage as keyof typeof THREE_KINGDOMS_STAGE_MOVES];
      for (const call of calls) {
        expect(accepted, `stage '${stage}' does not accept move '${call.move}'`).toContain(call.move);
      }
    });
  }
});

describe('the seeded RNG is actually deterministic — a failing seed must replay', () => {
  it('produces the identical sequence for the same seed, and a different one otherwise', () => {
    const a = Array.from({ length: 8 }, () => makeSeededRng(42).int(1000));
    const b = Array.from({ length: 8 }, () => makeSeededRng(42).int(1000));
    expect(a).toEqual(b);

    const one = makeSeededRng(1);
    const two = makeSeededRng(2);
    const seqOne = Array.from({ length: 8 }, () => one.int(1000));
    const seqTwo = Array.from({ length: 8 }, () => two.int(1000));
    expect(seqOne).not.toEqual(seqTwo);
  });

  it('shuffles without dropping or duplicating anything', () => {
    const rng = makeSeededRng(99);
    const items = ['a', 'b', 'c', 'd', 'e'];
    for (let i = 0; i < 20; i++) {
      expect([...rng.shuffle(items)].sort()).toEqual([...items].sort());
    }
  });
});
