// Task 4.1b — the mechanisms, with NOT ONE SKILL IMPLEMENTED.
//
// That is the task's own definition of done, and it is what this file tests: a
// skill is now pure content. Every fixture below registers a *fake* skill into
// the (empty) registry, shaped exactly like the real one it stands in for
// (奸雄's optional damage.after trigger, 武圣's cardsAs query, 咆哮's strikeLimit,
// 护驾's proxy supply…), runs it through the real engine, and unregisters it.
// If 4.2/4.3/4.4 have to touch engine/ to make their skills work, one of these
// tests was lying.

import { describe, it, expect, afterEach } from 'vitest';
import { pump, resolve } from '../../src/engine/pump.js';
import { cardsAs, demandCount, drawCount, ignoresDistance, strikeLimit, targetable, targetLimit } from '../../src/engine/queries.js';
import { distance } from '../../src/engine/distance.js';
import { collectListeners } from '../../src/engine/triggers.js';
import { ThreeKingdomsGame } from '../../src/bgio/game.js';
import { skillRegistry } from '../../src/content/skillRegistry.js';
import { assertQueryProvider } from '../../src/content/queryTypes.js';
import type { Skill } from '../../src/content/skillTypes.js';
import type { GState, PlayerId } from '../../src/engine/state.js';
import type { Frame } from '../../src/engine/frames.js';
import { makeGState, makePlayer, identityRng } from './fixtures.js';

// ── harness ───────────────────────────────────────────────────────────────

/** 曹操 owns 奸雄 (`jianxiong`, optional) and 护驾 (`hujia`, 主公技) in
 * content/standard/generals.json — so registering a fake skill under either id
 * gives the fixture player a real, live skill through the real source (general
 * → skillIds → registry), with no test-only back door into the fan-out. */
const registered: string[] = [];
function register(skill: Skill): void {
  skillRegistry[skill.id] = skill;
  registered.push(skill.id);
}
afterEach(() => {
  for (const id of registered) delete skillRegistry[id];
  registered.length = 0;
});

function twoPlayers(overrides: Partial<GState> = {}): GState {
  return makeGState({
    players: { '0': makePlayer('0'), '1': makePlayer('1') },
    seats: ['0', '1'],
    ...overrides,
  });
}

const actMoves = ThreeKingdomsGame.turn!.stages!.act.moves as unknown as Record<string, MoveFn>;
const demandMoves = ThreeKingdomsGame.turn!.stages!.demandCard.moves as unknown as Record<string, MoveFn>;
const confirmMoves = ThreeKingdomsGame.turn!.stages!.confirmSkill.moves as unknown as Record<string, MoveFn>;
const orderMoves = ThreeKingdomsGame.turn!.stages!.orderTriggers.moves as unknown as Record<string, MoveFn>;

interface MoveCtx {
  G: GState;
  ctx: { currentPlayer: PlayerId };
  random: { Shuffle<T>(deck: T[]): T[] };
  events: {
    setActivePlayers: (arg: { value: Record<PlayerId, string> }) => void;
    endTurn: (arg?: { next: PlayerId }) => void;
  };
  playerID: PlayerId;
}
type MoveFn = (ctx: MoveCtx, ...args: unknown[]) => unknown;
const moveCtx = (G: GState, playerID: PlayerId): MoveCtx => ({
  G,
  ctx: { currentPlayer: G.seats[G.activeSeat] },
  random: { Shuffle: <T,>(deck: T[]) => deck },
  events: { setActivePlayers: () => {}, endTurn: () => {} },
  playerID,
});

// ── §1: the skill source (derive, never subscribe) ────────────────────────

describe('the skill trigger source (§1)', () => {
  it('derives a living player’s triggers from their general’s skillIds, every single time', () => {
    register({
      id: 'jianxiong',
      locked: true,
      triggers: [
        { id: 'skill.jianxiong', event: 'damage.after', optional: false, when: () => true, effect: () => [] },
      ],
    });
    const G = twoPlayers();
    const ev = { event: 'damage.after', source: '1', target: '0', amount: 1, kind: 'normal', seq: 1 } as const;
    expect(collectListeners(G, ev).map((l) => [l.owner, l.triggerId])).toEqual([
      ['0', 'skill.jianxiong'],
      ['1', 'skill.jianxiong'], // both fixture players are 曹操
    ]);

    // Change the general and the trigger is simply gone — no unsubscribe call
    // anywhere, which is the whole point (engine-design §4's 青釭剑 case).
    G.players['1'].generalId = 'zhang_liao';
    expect(collectListeners(G, ev).map((l) => l.owner)).toEqual(['0']);
  });

  it('a 主公技 does not exist for a player who is not the lord (护驾/激将/救援)', () => {
    register({
      id: 'hujia',
      locked: false,
      lordOnly: true,
      triggers: [
        { id: 'skill.hujia', event: 'demand.open', optional: true, when: () => true, effect: () => [] },
      ],
    });
    const G = twoPlayers();
    const ev = { event: 'demand.open', from: '1', kind: 'dodge', count: 1 } as const;
    expect(collectListeners(G, ev)).toEqual([]); // nobody is the lord in the fixture

    G.players['0'].role = 'lord';
    expect(collectListeners(G, ev)).toMatchObject([{ owner: '0', priority: 300 }]); // the lord band
  });
});

// ── §3.4/§3.5: optional triggers and the engine-enforced limits ───────────

describe('optional triggers and limits (§3.4, §3.5)', () => {
  const fired: PlayerId[] = [];
  function registerOptional(limit?: 'once_per_turn' | 'once_per_phase' | 'once_per_damage'): void {
    fired.length = 0;
    register({
      id: 'jianxiong',
      locked: false,
      triggers: [
        {
          id: 'skill.jianxiong',
          event: 'damage.after',
          optional: true,
          ...(limit ? { limit } : {}),
          labelKey: 'skill.jianxiong.name',
          // 奸雄's real shape: it is MY skill, about damage dealt to ME. Both
          // fixture players are 曹操, so a `when: () => true` here would fan out
          // to two listeners and the test would be asserting the wrong thing.
          when: (e, _G, owner) => e.event === 'damage.after' && e.target === owner,
          effect: (_e, _G, owner) => {
            fired.push(owner);
            return [];
          },
        },
      ],
    });
  }
  const hit = (G: GState, target: PlayerId): void => {
    G.stack.push({ t: 'damage', source: null, target, amount: 1, kind: 'normal' });
    pump(G, identityRng);
  };

  it('asks before it runs, and a "yes" runs exactly the step that was offered', () => {
    registerOptional();
    const G = twoPlayers();
    hit(G, '0');

    expect(G.pending).toMatchObject({
      kind: 'confirmSkill',
      playerId: '0',
      triggerId: 'skill.jianxiong',
      labelKey: 'skill.jianxiong.name', // the prompt has something to render
    });
    expect(fired).toEqual([]);

    confirmMoves.respondSkill(moveCtx(G, '0'), true);
    expect(fired).toEqual(['0']);
  });

  it('a "no" runs nothing — and does NOT spend the skill’s once-per-turn', () => {
    registerOptional('once_per_turn');
    const G = twoPlayers();
    hit(G, '0');
    confirmMoves.respondSkill(moveCtx(G, '0'), false);
    expect(fired).toEqual([]);
    expect(G.turnFlags['used.skill.jianxiong']).toBeUndefined(); // declining is free

    hit(G, '0'); // damaged again — asked again
    expect(G.pending).toMatchObject({ kind: 'confirmSkill' });
    confirmMoves.respondSkill(moveCtx(G, '0'), true);
    expect(fired).toEqual(['0']);
    expect(G.turnFlags['used.skill.jianxiong']).toBe(true); // NOW it is spent
  });

  it('once_per_turn: the second damage of the same turn never even asks', () => {
    registerOptional('once_per_turn');
    const G = twoPlayers();
    hit(G, '0');
    confirmMoves.respondSkill(moveCtx(G, '0'), true);
    expect(fired).toEqual(['0']);

    hit(G, '0');
    expect(G.pending).toBeNull(); // the limit is the ENGINE's, not the skill's when()
    expect(fired).toEqual(['0']);
  });

  it('once_per_phase: spent within a phase, cleared on entering the next one', () => {
    registerOptional('once_per_phase');
    const G = twoPlayers({ turnPhase: 'draw' });
    hit(G, '0');
    confirmMoves.respondSkill(moveCtx(G, '0'), true);
    expect(G.turnFlags['usedPhase.skill.jianxiong']).toBe(true);

    hit(G, '0');
    expect(G.pending).toBeNull(); // still the same phase

    resolve({ t: 'phase', phase: 'action' }, G, identityRng); // a new phase
    expect(G.turnFlags['usedPhase.skill.jianxiong']).toBeUndefined();
  });

  it('once_per_damage is scoped to the damage INSTANCE, not the turn (遗计 is per point)', () => {
    registerOptional('once_per_damage');
    const G = twoPlayers();

    hit(G, '0'); // instance seq 1
    confirmMoves.respondSkill(moveCtx(G, '0'), true);
    expect(G.turnFlags['usedDamage.1.skill.jianxiong']).toBe(true);

    hit(G, '0'); // a SECOND, separate instance in the same turn ⇒ fires again
    expect(G.pending).toMatchObject({ kind: 'confirmSkill' });
    confirmMoves.respondSkill(moveCtx(G, '0'), true);
    expect(fired).toEqual(['0', '0']);
  });

  it('a 锁定技 (optional: false) never prompts', () => {
    fired.length = 0;
    register({
      id: 'jianxiong',
      locked: true,
      triggers: [
        {
          id: 'skill.jianxiong',
          event: 'damage.after',
          optional: false,
          when: (e, _G, owner) => e.event === 'damage.after' && e.target === owner,
          effect: (_e, _G, owner) => {
            fired.push(owner);
            return [];
          },
        },
      ],
    });
    const G = twoPlayers();
    hit(G, '0');
    expect(G.pending).toBeNull();
    expect(fired).toEqual(['0']);
  });
});

// ── §3.1 step 3: the owner orders their own simultaneous triggers ─────────

describe('orderTriggers (§3.1 step 3)', () => {
  const fired: string[] = [];
  function registerTwoOnOneEvent(): void {
    fired.length = 0;
    const step = (id: string) => ({
      id,
      event: 'turn.start' as const,
      optional: false,
      when: () => true,
      effect: () => {
        fired.push(id);
        return [] as Frame[];
      },
    });
    register({ id: 'jianxiong', locked: true, triggers: [step('skill.a'), step('skill.b')] });
  }

  it('asks the owner rather than silently resolving the tie by registration order', () => {
    registerTwoOnOneEvent();
    const G = twoPlayers({ players: { '0': makePlayer('0') }, seats: ['0'] });
    G.stack.push({ t: 'trigger', ev: { event: 'turn.start', player: '0' } });
    pump(G, identityRng);

    expect(G.pending).toMatchObject({
      kind: 'orderTriggers',
      playerId: '0',
      triggerIds: ['skill.a', 'skill.b'],
    });
    expect(fired).toEqual([]); // nothing ran while the question was open
  });

  it('runs them in the order the owner chose', () => {
    registerTwoOnOneEvent();
    const G = twoPlayers({ players: { '0': makePlayer('0') }, seats: ['0'] });
    G.stack.push({ t: 'trigger', ev: { event: 'turn.start', player: '0' } });
    pump(G, identityRng);

    orderMoves.orderTriggers(moveCtx(G, '0'), ['skill.b', 'skill.a']);
    expect(fired).toEqual(['skill.b', 'skill.a']);
    expect(G.pending).toBeNull(); // asked once, not once per step
  });

  it('rejects an answer that is not a permutation of what was offered', () => {
    registerTwoOnOneEvent();
    const G = twoPlayers({ players: { '0': makePlayer('0') }, seats: ['0'] });
    G.stack.push({ t: 'trigger', ev: { event: 'turn.start', player: '0' } });
    pump(G, identityRng);

    expect(orderMoves.orderTriggers(moveCtx(G, '0'), ['skill.b'])).toBe('INVALID_MOVE');
    expect(orderMoves.orderTriggers(moveCtx(G, '0'), ['skill.a', 'skill.a'])).toBe('INVALID_MOVE');
  });
});

// ── §4: the query fold ───────────────────────────────────────────────────

describe('the query fold (§4)', () => {
  it('cardsAs is PERMISSIVE and OR-folded — 武圣 lets a red card be played as a 杀', () => {
    const G = twoPlayers();
    const heart = { id: 'peach_3h', effectKey: 'peach', suit: 'hearts' } as never;
    expect(cardsAs(G, '0', [heart], 'strike')).toBe(false); // base rule: a 桃 is a 桃

    register({
      id: 'jianxiong', // standing in for 武圣
      locked: false,
      queries: {
        cardsAs: (_G, _owner, cards, as) =>
          as === 'strike' && cards.length === 1 && (cards[0] as { suit: string }).suit === 'hearts',
      },
    });
    expect(cardsAs(G, '0', [heart], 'strike')).toBe(true);
    // …and it does not make the card BE a 杀: it is still a 桃 for every other
    // question (the discard pile sees a ♥, which is what 铁骑 reads).
    expect(heart.effectKey).toBe('peach');
  });

  it('targetable is AND-folded — a prohibition (空城) cannot be overridden by a permission', () => {
    const G = twoPlayers();
    register({
      id: 'jianxiong', // 空城
      locked: true,
      queries: { targetable: (Gs, owner) => Gs.players[owner].hand.length > 0 },
    });
    expect(targetable(G, '1', '0', 'strike')).toBe(false); // empty hand
    G.players['1'].hand = ['dodge_2h1'];
    expect(targetable(G, '1', '0', 'strike')).toBe(true);
  });

  it('strikeLimit / drawCount / demandCount / targetLimit are CHAINED (咆哮, 英姿, 无双, 方天画戟)', () => {
    const G = twoPlayers();
    expect(strikeLimit(G, '0', 1)).toBe(1);
    expect(drawCount(G, '0', 2)).toBe(2);
    expect(demandCount(G, '0', 'dodge', 1)).toBe(1);
    expect(targetLimit(G, '0', 'strike', 1)).toBe(1);

    register({
      id: 'jianxiong',
      locked: true, // all four are locked-only folds
      queries: {
        strikeLimit: () => Infinity, // 咆哮
        drawCount: (_G, _o, current) => current + 1, // 英姿
        demandCount: (_G, _o, kind, current) => (kind === 'dodge' ? current + 1 : current), // 无双
        targetLimit: (_G, _o, _k, current) => current + 1, // 方天画戟
      },
    });
    expect(strikeLimit(G, '0', 1)).toBe(Infinity);
    expect(drawCount(G, '0', 2)).toBe(3);
    expect(demandCount(G, '0', 'dodge', 1)).toBe(2);
    expect(demandCount(G, '0', 'peach', 1)).toBe(1); // …only the kind it names
    expect(targetLimit(G, '0', 'strike', 1)).toBe(2);
  });

  it('ignoresDistance (奇才) and distanceModifier (马术) reach the engine that asks them', () => {
    const G = makeGState({
      players: { '0': makePlayer('0'), '1': makePlayer('1'), '2': makePlayer('2', { seat: 2 }) },
      seats: ['0', '1', '2'],
    });
    expect(distance(G, '0', '2')).toBe(1); // 3 seats: everyone is adjacent
    expect(ignoresDistance(G, '0', 'indulgence')).toBe(false);

    register({
      id: 'jianxiong',
      locked: true,
      queries: {
        // 马术: −1 to every distance MEASURED BY the owner. Clamped at 1 by
        // distance() itself, so a 3-seat table can't show the arithmetic —
        // what it does show is that the fold is consulted at all.
        distanceModifier: (_G, from, _to, owner) => (from === owner ? -1 : 0),
        ignoresDistance: (_G, _o, effectKey) => effectKey === 'indulgence', // 奇才
      },
    });
    expect(distance(G, '0', '2')).toBe(1);
    expect(ignoresDistance(G, '0', 'indulgence')).toBe(true);
    expect(ignoresDistance(G, '0', 'strike')).toBe(false);
  });

  it('FAILS AT BOOT if a non-locked skill answers a fold that cannot stop and ask (§4)', () => {
    // The whole locked-only rule, in one assertion. 裸衣 is the worked example:
    // an optional modifier must split into a trigger (which asks and writes a
    // {t:'flag'}) plus a locked query (which reads it) — §11.
    expect(() =>
      assertQueryProvider({
        id: 'luoyi',
        priority: 200,
        locked: false,
        handlers: { drawCount: (_G, _o, current) => current - 1 },
      }),
    ).toThrow(/not locked/);
  });
});

// ── §4.1 + §5: 视为 through the moves, and the demand protocol ────────────

describe('视为 (playCard asEffectKey) and the demand protocol (§4.1, §5, §12.2)', () => {
  /** 武圣-shaped: any ♥ may be used as a 杀 (and as a 闪, so one fixture can
   * drive both the play path and the supply path). */
  function registerHeartsAs(): void {
    register({
      id: 'jianxiong',
      locked: false,
      queries: {
        cardsAs: (_G, _owner, cards, as) =>
          (as === 'strike' || as === 'dodge') &&
          cards.length === 1 &&
          (cards[0] as { suit: string }).suit === 'hearts',
      },
    });
  }

  it('playCard validates the 视为 claim through cardsAs — and rejects it without the skill', () => {
    const G = twoPlayers({ pending: { kind: 'act', playerId: '0' } });
    G.players['0'].hand = ['peach_3h'];

    expect(actMoves.playCard(moveCtx(G, '0'), 'peach_3h', ['1'], 'strike')).toBe('INVALID_MOVE');

    registerHeartsAs();
    G.players['1'].hand = [];
    expect(actMoves.playCard(moveCtx(G, '0'), 'peach_3h', ['1'], 'strike')).toBeUndefined();

    // The 杀 resolved: damage landed, the limit was spent, and the PHYSICAL
    // card in the discard pile is still a ♥桃 (which is what 铁骑 will read).
    expect(G.players['1'].hp).toBe(3);
    expect(G.turnFlags.strikesPlayed).toBe(1);
    expect(G.discardPile).toEqual(['peach_3h']);
  });

  it('supplyCards validates the answer through cardsAs too (龙胆/急救 hook exactly here)', () => {
    registerHeartsAs();
    const G = twoPlayers({ pending: { kind: 'act', playerId: '0' } });
    G.players['0'].hand = ['strike_2c'];
    G.players['1'].hand = ['peach_3h']; // a ♥, deemed a 闪 by the fake skill

    actMoves.playCard(moveCtx(G, '0'), 'strike_2c', ['1']);
    // The demand was raised at all BECAUSE the fold said they could answer.
    expect(G.pending).toMatchObject({ kind: 'demandCard', playerId: '1', demandKind: 'dodge' });

    expect(demandMoves.supplyCards(moveCtx(G, '1'), ['peach_3h'])).toBeUndefined();
    expect(G.players['1'].hp).toBe(4); // 闪'd with a 桃
  });

  it('无双: demandCount is folded inside demandAsk, not baked in by the demander', () => {
    register({
      id: 'jianxiong', // 无双
      locked: true,
      queries: { demandCount: (_G, _o, kind, current) => (kind === 'dodge' ? 2 : current) },
    });
    const G = twoPlayers({ pending: { kind: 'act', playerId: '0' } });
    G.players['0'].hand = ['strike_2c'];
    G.players['1'].hand = ['dodge_2h1', 'dodge_2h2'];

    actMoves.playCard(moveCtx(G, '0'), 'strike_2c', ['1']);
    expect(G.pending).toMatchObject({ demandKind: 'dodge', count: 2 });
    // A PARTIAL ANSWER IS NO ANSWER (§5.4).
    expect(demandMoves.supplyCards(moveCtx(G, '1'), ['dodge_2h1'])).toBe('INVALID_MOVE');
    expect(demandMoves.supplyCards(moveCtx(G, '1'), ['dodge_2h1', 'dodge_2h2'])).toBeUndefined();
    expect(G.players['1'].hp).toBe(4);
  });

  it('无双 vs a target who can only answer once: never asked, and the 杀 lands', () => {
    register({
      id: 'jianxiong',
      locked: true,
      queries: { demandCount: (_G, _o, kind, current) => (kind === 'dodge' ? 2 : current) },
    });
    const G = twoPlayers({ pending: { kind: 'act', playerId: '0' } });
    G.players['0'].hand = ['strike_2c'];
    G.players['1'].hand = ['dodge_2h1']; // one 闪, two demanded

    actMoves.playCard(moveCtx(G, '0'), 'strike_2c', ['1']);
    expect(G.pending).toMatchObject({ kind: 'act', playerId: '0' });
    expect(G.players['1'].hp).toBe(3);
    expect(G.players['1'].hand).toEqual(['dodge_2h1']); // not spent
  });

  it('demandAsk does NOT ask when the demand is already answered (a proxy/deemed card got there first)', () => {
    // This is §12.2's whole reason for existing: the demand.open fan-out runs
    // BEFORE the "can they even answer?" check, so 护驾 (a Wei player answers
    // for the lord) and 八卦阵 (a judgement deems a 闪) can make an
    // un-answerable demand answerable — which the pre-4.1b ordering could
    // never learn.
    const G = twoPlayers();
    G.stack.push({
      t: 'resume',
      effectKey: 'strike',
      ctx: { source: '0', cards: ['strike_2c'], targets: ['1'], demanded: true },
    });
    resolve(
      { t: 'demand', kind: 'dodge', from: '1', by: '0', count: 1, reasonKey: 'demand.dodge' },
      G,
      identityRng,
    );
    G.demand!.supplied = []; // ← what a proxy or a deemed card writes
    pump(G, identityRng);

    expect(G.pending).toBeNull(); // never asked '1' anything
    expect(G.players['1'].hp).toBe(4); // …and the 杀 was answered
    expect(G.demand).toBeNull(); // demandClose cleaned up
  });
});

// ── F2 ───────────────────────────────────────────────────────────────────

describe('F2: playerView filters non-public player flags', () => {
  it('sends only pub.* keys of OTHER players, and everything of your own', () => {
    const G = twoPlayers();
    G.players['0'].flags = { 'pub.awakened': true, secret: 'plan' };
    G.players['1'].flags = { 'pub.awakened': false, secret: 'other plan' };

    const view = ThreeKingdomsGame.playerView!({ G, ctx: {} as never, playerID: '0' }) as {
      players: Record<string, { flags: Record<string, unknown> }>;
      damage: unknown;
      demand: unknown;
      judgement: unknown;
      stack?: unknown;
    };

    expect(view.players['0'].flags).toEqual({ 'pub.awakened': true, secret: 'plan' });
    expect(view.players['1'].flags).toEqual({ 'pub.awakened': false }); // the secret is gone
    // The three in-flight windows ARE public — all three are face up at a real
    // table — and the stack is not sent at all.
    expect(view.damage).toBeNull();
    expect(view.demand).toBeNull();
    expect(view.judgement).toBeNull();
    expect(view.stack).toBeUndefined();
  });
});

// ── §1's third face: an active skill ──────────────────────────────────────

describe('active skills (useSkill)', () => {
  it('resolves through the ordinary CardEffect machinery, under the namespaced key skill.<id>', () => {
    const seen: unknown[] = [];
    register({
      id: 'jianxiong', // standing in for 制衡
      locked: false,
      activeLimit: 'once_per_turn',
      active: {
        key: 'skill.jianxiong',
        targeting: { min: 0, max: 0, self: 'only' },
        canPlay: () => true,
        resolve: (_G, ctx) => {
          seen.push(ctx);
          return [{ t: 'draw', player: ctx.source as PlayerId, count: 1 }];
        },
      },
    });
    const G = twoPlayers({ pending: { kind: 'act', playerId: '0' }, drawPile: ['strike_2c'] });
    G.players['0'].hand = ['peach_3h'];

    expect(actMoves.useSkill(moveCtx(G, '0'), 'jianxiong', ['peach_3h'], [])).toBeUndefined();
    expect(seen).toEqual([{ source: '0', cards: ['peach_3h'], targets: [] }]);
    // The skill decided what happened to the card it was given: nothing. An
    // active skill discards through {t:'moveCards'} if it wants to — the move
    // does not do it for them (仁德 gives them away, 苦肉 costs none at all).
    expect(G.players['0'].hand).toEqual(['peach_3h', 'strike_2c']);
    // …and the action phase is still the player's.
    expect(G.pending).toMatchObject({ kind: 'act', playerId: '0' });
  });

  it('每回合限一次 is enforced by the engine, not by the skill', () => {
    register({
      id: 'jianxiong',
      locked: false,
      activeLimit: 'once_per_turn',
      active: {
        key: 'skill.jianxiong',
        targeting: { min: 0, max: 0, self: 'only' },
        canPlay: () => true,
        resolve: () => [],
      },
    });
    const G = twoPlayers({ pending: { kind: 'act', playerId: '0' } });
    expect(actMoves.useSkill(moveCtx(G, '0'), 'jianxiong', [], [])).toBeUndefined();
    expect(G.turnFlags['used.active.jianxiong']).toBe(true);
    expect(actMoves.useSkill(moveCtx(G, '0'), 'jianxiong', [], [])).toBe('INVALID_MOVE');
  });

  it('rejects a skill the player does not have (and a 主公技 they are not the lord for)', () => {
    register({
      id: 'hujia',
      locked: false,
      lordOnly: true,
      active: {
        key: 'skill.hujia',
        targeting: { min: 0, max: 0, self: 'only' },
        canPlay: () => true,
        resolve: () => [],
      },
    });
    const G = twoPlayers({ pending: { kind: 'act', playerId: '0' } });
    expect(actMoves.useSkill(moveCtx(G, '0'), 'hujia', [], [])).toBe('INVALID_MOVE');
    expect(actMoves.useSkill(moveCtx(G, '0'), 'not_a_skill', [], [])).toBe('INVALID_MOVE');

    G.players['0'].role = 'lord';
    expect(actMoves.useSkill(moveCtx(G, '0'), 'hujia', [], [])).toBeUndefined();
  });
});

// ── §11's split pattern, end to end ──────────────────────────────────────

describe('裸衣: an optional MODIFIER splits into a trigger + a locked query (§11)', () => {
  it('the trigger asks and writes a {t:flag}; the locked query reads it — and the fold never has to ask', () => {
    // The pattern for every future "you may choose to do X, and then Y is
    // different all turn." It is why {t:'flag'} exists at all, and it is what
    // the 4.1a source cross-check forced back into the design.
    register({
      id: 'jianxiong', // 裸衣
      locked: true, // the QUERY half is locked — a fold cannot stop and ask
      triggers: [
        {
          id: 'skill.luoyi',
          event: 'phase.start',
          optional: true, // …the CHOICE half is not
          when: (e, _G, owner) => e.event === 'phase.start' && e.phase === 'draw' && e.player === owner,
          effect: () => [{ t: 'flag', key: 'luoyi', value: true }],
        },
      ],
      queries: {
        drawCount: (Gs, _owner, current) => (Gs.turnFlags.luoyi === true ? current - 1 : current),
      },
    });

    const G = twoPlayers({ drawPile: ['strike_2c', 'dodge_2h1', 'peach_3h'] });
    G.stack.push({ t: 'phase', phase: 'draw' });
    pump(G, identityRng);

    // Asked at phase.start, before the body — which is the entire reason the
    // phase had to split in two (§2.2).
    expect(G.pending).toMatchObject({ kind: 'confirmSkill', triggerId: 'skill.luoyi' });
    confirmMoves.respondSkill(moveCtx(G, '0'), true);

    expect(G.turnFlags.luoyi).toBe(true);
    expect(G.players['0'].hand).toEqual(['strike_2c']); // 2 − 1: the query read the flag
  });

  it('declining leaves the flag unset and the draw at 2', () => {
    register({
      id: 'jianxiong',
      locked: true,
      triggers: [
        {
          id: 'skill.luoyi',
          event: 'phase.start',
          optional: true,
          when: (e, _G, owner) => e.event === 'phase.start' && e.phase === 'draw' && e.player === owner,
          effect: () => [{ t: 'flag', key: 'luoyi', value: true }],
        },
      ],
      queries: {
        drawCount: (Gs, _owner, current) => (Gs.turnFlags.luoyi === true ? current - 1 : current),
      },
    });

    const G = twoPlayers({ drawPile: ['strike_2c', 'dodge_2h1', 'peach_3h'] });
    G.stack.push({ t: 'phase', phase: 'draw' });
    pump(G, identityRng);
    confirmMoves.respondSkill(moveCtx(G, '0'), false);

    expect(G.turnFlags.luoyi).toBeUndefined();
    expect(G.players['0'].hand).toEqual(['strike_2c', 'dodge_2h1']);
  });
});

describe('突袭: a phase.start trigger can skip the phase it is standing in (§2.2)', () => {
  it('the body re-reads skipPhases when IT pops, so the skip lands in time to cancel the draw', () => {
    register({
      id: 'jianxiong', // 突袭
      locked: true,
      triggers: [
        {
          id: 'skill.tuxi',
          event: 'phase.start',
          optional: false,
          when: (e, _G, owner) => e.event === 'phase.start' && e.phase === 'draw' && e.player === owner,
          effect: () => [{ t: 'skipPhase', phase: 'draw' }],
        },
      ],
    });

    const G = twoPlayers({ drawPile: ['strike_2c', 'dodge_2h1'] });
    G.stack.push({ t: 'phase', phase: 'draw' });
    pump(G, identityRng);

    expect(G.players['0'].hand).toEqual([]); // no draw
    expect(G.drawPile).toEqual(['strike_2c', 'dodge_2h1']);
    expect(G.pending).toMatchObject({ kind: 'act' }); // …and the turn carried on
  });
});

// ── §2's emission table: the events that were missing before 4.1b ─────────

describe('event emission (§2)', () => {
  function recorder(event: 'card.lost' | 'card.gained', sink: unknown[]): void {
    register({
      id: 'jianxiong',
      locked: true,
      triggers: [
        {
          id: `skill.${event}`,
          event,
          optional: false,
          // Both fixture players are 曹操, so pin the listener to one of them —
          // otherwise the fan-out (correctly) records the same event twice.
          when: (_e, _G, owner) => owner === '0',
          effect: (e) => {
            sink.push(e);
            return [];
          },
        },
      ],
    });
  }

  it('card.gained fires from the {t:draw} primitive — the one place cards enter a hand', () => {
    const seen: unknown[] = [];
    recorder('card.gained', seen);
    const G = twoPlayers({ drawPile: ['strike_2c', 'dodge_2h1'] });
    G.stack.push({ t: 'draw', player: '0', count: 2 });
    pump(G, identityRng);
    expect(seen).toEqual([{ event: 'card.gained', player: '0', count: 2 }]);
  });

  it('card.lost fires from {t:moveCards} (连营 hears a hand empty; 枭姬 hears equipment go)', () => {
    const seen: unknown[] = [];
    recorder('card.lost', seen);
    const G = twoPlayers();
    G.players['0'].hand = ['strike_2c'];
    G.stack.push({
      t: 'moveCards',
      cards: ['strike_2c'],
      from: { z: 'hand', player: '0' },
      to: { z: 'discard' },
    });
    pump(G, identityRng);
    expect(seen).toEqual([
      { event: 'card.lost', player: '0', cards: ['strike_2c'], from: 'hand' },
    ]);
  });

  it('card.lost fires from the moves that discard directly, too (playCard)', () => {
    const seen: unknown[] = [];
    recorder('card.lost', seen);
    const G = twoPlayers({ pending: { kind: 'act', playerId: '0' } });
    G.players['0'].hp = 2;
    G.players['0'].hand = ['peach_3h'];
    actMoves.playCard(moveCtx(G, '0'), 'peach_3h', []);
    expect(seen).toEqual([{ event: 'card.lost', player: '0', cards: ['peach_3h'], from: 'hand' }]);
  });
});
