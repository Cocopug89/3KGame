// Task 4.4 (Batch C) — 15 complex skills + 国色's pickup. See
// docs/handoff/4.4-batchC-skills.md. Style follows the other batches: call
// query handlers / trigger when()/effect() directly against a hand-built
// GState, no server/socket/mocks (engine-design §8).

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../engine/fixtures.js';
import type { GState } from '../../src/engine/state.js';
import { wushuang } from '../../src/content/skills/wushuang.js';
import { jijiu } from '../../src/content/skills/jijiu.js';
import { guose } from '../../src/content/skills/guose.js';
import { tiandu } from '../../src/content/skills/tiandu.js';
import { guicai } from '../../src/content/skills/guicai.js';
import { jiuyuan } from '../../src/content/skills/jiuyuan.js';
import { hujia } from '../../src/content/skills/hujia.js';
import { tieji } from '../../src/content/skills/tieji.js';
import { liuli } from '../../src/content/skills/liuli.js';
import { rende } from '../../src/content/skills/rende.js';
import { jieyin } from '../../src/content/skills/jieyin.js';
import { lijian } from '../../src/content/skills/lijian.js';
import { fanjian } from '../../src/content/skills/fanjian.js';
import { tiejiResult } from '../../src/content/effects/tiejiResult.js';
import { yijiDistribute } from '../../src/content/effects/yijiDistribute.js';
import { lordProxyEffect } from '../../src/content/effects/lordProxy.js';

function cardDef(suit: string, effectKey = 'x') {
  return { suit, effectKey } as never; // CardDef stub — only `suit` is read by these handlers
}

describe('wushuang.demandCount (locked query)', () => {
  it('doubles a dodge or strike demand, leaves everything else alone', () => {
    const G = makeGState();
    expect(wushuang.queries!.demandCount!(G, '0', 'dodge', 1)).toBe(2);
    expect(wushuang.queries!.demandCount!(G, '0', 'strike', 1)).toBe(2);
    expect(wushuang.queries!.demandCount!(G, '0', 'peach', 1)).toBe(1);
  });
});

describe('jijiu.cardsAs — "outside your own turn, any red card is a peach" (§11 confirmed wording)', () => {
  it('permits a red card when it is not the owner\'s turn', () => {
    const G = makeGState({ activeSeat: 1 }); // seats[1] = '1' is the turn player
    expect(jijiu.queries!.cardsAs!(G, '0', [cardDef('hearts')], 'peach')).toBe(true);
    expect(jijiu.queries!.cardsAs!(G, '0', [cardDef('diamonds')], 'peach')).toBe(true);
  });

  it('refuses on the owner\'s own turn', () => {
    const G = makeGState({ activeSeat: 0 });
    expect(jijiu.queries!.cardsAs!(G, '0', [cardDef('hearts')], 'peach')).toBe(false);
  });

  it('refuses a black card, and refuses for anything other than peach', () => {
    const G = makeGState({ activeSeat: 1 });
    expect(jijiu.queries!.cardsAs!(G, '0', [cardDef('spades')], 'peach')).toBe(false);
    expect(jijiu.queries!.cardsAs!(G, '0', [cardDef('hearts')], 'dodge')).toBe(false);
  });
});

describe('guose.cardsAs — any Diamond as 乐不思蜀', () => {
  it('permits a diamond as indulgence only', () => {
    const G = makeGState();
    expect(guose.queries!.cardsAs!(G, '0', [cardDef('diamonds')], 'indulgence')).toBe(true);
    expect(guose.queries!.cardsAs!(G, '0', [cardDef('hearts')], 'indulgence')).toBe(false);
    expect(guose.queries!.cardsAs!(G, '0', [cardDef('diamonds')], 'dodge')).toBe(false);
  });
});

describe('tiandu — takes your own resolved judgement card', () => {
  const trigger = tiandu.triggers![0];

  it('fires only for your own judge.result, when there is a card to take', () => {
    const G = makeGState({ discardPile: ['strike_2c'] });
    expect(trigger.when({ event: 'judge.result', target: '0', reasonKey: 'judge.x' }, G, '0')).toBe(true);
    expect(trigger.when({ event: 'judge.result', target: '1', reasonKey: 'judge.x' }, G, '0')).toBe(false);
  });

  it('takes the top of the discard pile (the card judgeResult just pushed)', () => {
    const G = makeGState({ discardPile: ['peach_3h', 'strike_2c'] });
    const frames = trigger.effect({ event: 'judge.result', target: '0', reasonKey: 'judge.x' }, G, '0');
    expect(frames).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'discard' }, to: { z: 'hand', player: '0' }, by: '0' },
    ]);
  });
});

describe('guicai — asks to replace ANY judgement, own or not', () => {
  const trigger = guicai.triggers![0];

  it('fires for someone else\'s judgement too, as long as owner holds a card', () => {
    const G = makeGState({ players: { '0': makePlayer('0', { hand: ['strike_2c'] }), '1': makePlayer('1') } });
    expect(trigger.when({ event: 'judge.card', target: '1', reasonKey: 'judge.x' }, G, '0')).toBe(true);
  });

  it('does not fire with an empty hand', () => {
    const G = makeGState();
    expect(trigger.when({ event: 'judge.card', target: '0', reasonKey: 'judge.x' }, G, '0')).toBe(false);
  });

  it('asks via a guicaiRetrial request, not the hidden-card slot protocol', () => {
    const G = makeGState({ players: { '0': makePlayer('0', { hand: ['strike_2c'] }), '1': makePlayer('1') } });
    const frames = trigger.effect({ event: 'judge.card', target: '1', reasonKey: 'judge.x' }, G, '0');
    expect(frames).toEqual([
      { t: 'request', req: { kind: 'guicaiRetrial', playerId: '0', reasonKey: 'skill.guicai' } },
    ]);
  });
});

describe('jiuyuan — lord skill, locked, extra hp only from a real Wu peach while dying', () => {
  const trigger = jiuyuan.triggers![0];

  function state(overrides: Partial<GState> = {}): GState {
    return makeGState({
      players: {
        '0': makePlayer('0', { generalId: 'sun_quan', role: 'lord', hp: 1, maxHp: 4 }),
        '1': makePlayer('1', { generalId: 'da_qiao' }), // Wu
        '2': makePlayer('2', { generalId: 'guan_yu' }), // Shu
      },
      seats: ['0', '1', '2'],
      ...overrides,
    });
  }

  it('fires for a real peach from a Wu ally that closed a dying window', () => {
    const G = state();
    G.players['0'].hp = 1; // post-heal hp; amount=1 ⇒ before = 0 (was dying)
    const ev = { event: 'heal.after' as const, target: '0', source: '1', amount: 1, card: 'peach_3h' };
    expect(trigger.when(ev, G, '0')).toBe(true);
  });

  it('does not fire for a non-Wu healer', () => {
    const G = state();
    const ev = { event: 'heal.after' as const, target: '0', source: '2', amount: 1, card: 'peach_3h' };
    expect(trigger.when(ev, G, '0')).toBe(false);
  });

  it('does not fire for a bare heal with no card, or when not actually dying', () => {
    const G = state();
    G.players['0'].hp = 3; // before = 2, not dying
    const evNoCard = { event: 'heal.after' as const, target: '0', source: '1', amount: 1 };
    expect(trigger.when(evNoCard, G, '0')).toBe(false);
    const evNotDying = { event: 'heal.after' as const, target: '0', source: '1', amount: 1, card: 'peach_3h' };
    expect(trigger.when(evNotDying, G, '0')).toBe(false);
  });
});

describe('hujia / lordProxyEffect — asks eligible allies in seat order, stops at the first supply', () => {
  const proxy = lordProxyEffect({ key: 'hujia_proxy', kind: 'dodge', kingdom: 'wei' });

  it('asks the next Wei ally in seat order, skipping non-Wei and dead seats', () => {
    const G = makeGState({
      players: {
        '0': makePlayer('0', { generalId: 'cao_cao', role: 'lord' }), // wei, owner
        '1': makePlayer('1', { generalId: 'guan_yu' }), // shu — skipped
        '2': makePlayer('2', { generalId: 'sima_yi' }), // wei — asked
        '3': makePlayer('3', { generalId: 'xu_chu', alive: false }), // wei but dead — skipped
      },
      seats: ['0', '1', '2', '3'],
      demand: { kind: 'dodge', from: '0', by: '1', count: 1, reasonKey: 'demand.dodge', supplied: null },
    });
    const frames = proxy.resolve(G, { owner: '0' });
    expect(frames).toEqual([
      {
        t: 'request',
        req: { kind: 'demandCard', playerId: '2', demandKind: 'dodge', count: 1, reasonKey: 'demand.dodge' },
      },
      { t: 'resume', effectKey: 'hujia_proxy', ctx: { owner: '0', order: ['2'], index: 1 } },
    ]);
  });

  it('stops asking once the demand has already been supplied', () => {
    const G = makeGState({
      demand: { kind: 'dodge', from: '0', by: '1', count: 1, reasonKey: 'demand.dodge', supplied: ['dodge_2h'] },
    });
    expect(proxy.resolve(G, { owner: '0', order: ['2'], index: 0 })).toEqual([]);
  });

  it('returns [] once every ally has been asked', () => {
    const G = makeGState({ demand: { kind: 'dodge', from: '0', by: '1', count: 1, reasonKey: 'demand.dodge', supplied: null } });
    expect(proxy.resolve(G, { owner: '0', order: ['2'], index: 1 })).toEqual([]);
  });
});

describe('tieji — judges on card.target; a red result sets the generic force-hit flag', () => {
  const trigger = tieji.triggers![0];

  it('fires only for its OWN strike, targeting someone', () => {
    const G = makeGState({ drawPile: ['strike_2c'] });
    const ev = { event: 'card.target' as const, source: '0', target: '1', effectKey: 'strike', cards: ['strike_2c'] };
    expect(trigger.when(ev, G, '0')).toBe(true);
    expect(trigger.when({ ...ev, source: '1' }, G, '0')).toBe(false);
    expect(trigger.when({ ...ev, effectKey: 'duel' }, G, '0')).toBe(false);
  });

  it('tiejiResult sets the force-hit flag on red, nothing on black', () => {
    expect(tiejiResult.resolve(makeGState(), { judgeCard: 'strike_jh' })).toEqual([
      { t: 'flag', key: 'tieji.forceHit', value: true },
    ]);
    expect(tiejiResult.resolve(makeGState(), { judgeCard: 'strike_2c' })).toEqual([]);
  });
});

describe('liuli — redirects a strike targeting you to someone in YOUR attack range', () => {
  const trigger = liuli.triggers![0];

  function state(): GState {
    return makeGState({
      players: {
        '0': makePlayer('0'), // strike source
        '1': makePlayer('1', { hand: ['strike_2c'] }), // strike target — has liuli
        '2': makePlayer('2'), // redirect candidate, distance 1
      },
      seats: ['0', '1', '2'],
    });
  }

  it('fires for the target of a strike who has a card and a legal redirect', () => {
    const G = state();
    const ev = { event: 'card.target' as const, source: '0', target: '1', effectKey: 'strike', cards: ['strike_2c'] };
    expect(trigger.when(ev, G, '1')).toBe(true);
  });

  it('does not fire for the strike\'s own source, or with an empty hand', () => {
    const G = state();
    const ev = { event: 'card.target' as const, source: '0', target: '1', effectKey: 'strike', cards: ['strike_2c'] };
    expect(trigger.when(ev, G, '0')).toBe(false);
    G.players['1'].hand = [];
    expect(trigger.when(ev, G, '1')).toBe(false);
  });

  it('offers every OTHER living player in range as a redirect candidate, excluding the original source', () => {
    const G = state();
    const ev = { event: 'card.target' as const, source: '0', target: '1', effectKey: 'strike', cards: ['strike_2c'] };
    const frames = trigger.effect(ev, G, '1');
    expect(frames).toEqual([
      { t: 'request', req: { kind: 'liuliRedirect', playerId: '1', candidates: ['2'], reasonKey: 'skill.liuli' } },
    ]);
  });
});

describe('rende — repeatable gifts; heals once, on the invocation that crosses two given', () => {
  it('gives the card(s) and does not heal below the threshold', () => {
    const G = makeGState({
      players: { '0': makePlayer('0', { hand: ['strike_2c'] }), '1': makePlayer('1') },
    });
    const frames = rende.active!.resolve(G, { source: '0', targets: ['1'], cards: ['strike_2c'] });
    expect(frames).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'hand', player: '0' }, to: { z: 'hand', player: '1' }, by: '0' },
      { t: 'flag', key: 'rende.given', value: 1 },
    ]);
  });

  it('heals exactly once, the moment the running total reaches two', () => {
    const G = makeGState({
      players: { '0': makePlayer('0', { hand: ['strike_2c', 'peach_3h'] }), '1': makePlayer('1') },
      turnFlags: { strikesPlayed: 0, strikeLimit: 1, 'rende.given': 1 },
    });
    const frames = rende.active!.resolve(G, { source: '0', targets: ['1'], cards: ['strike_2c'] });
    expect(frames).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'hand', player: '0' }, to: { z: 'hand', player: '1' }, by: '0' },
      { t: 'flag', key: 'rende.given', value: 2 },
      { t: 'flag', key: 'rende.healed', value: true },
      { t: 'heal', target: '0', amount: 1, source: '0' },
    ]);
  });

  it('does not heal a second time once already healed this turn', () => {
    const G = makeGState({
      players: { '0': makePlayer('0', { hand: ['strike_2c'] }), '1': makePlayer('1') },
      turnFlags: { strikesPlayed: 0, strikeLimit: 1, 'rende.given': 3, 'rende.healed': true },
    });
    const frames = rende.active!.resolve(G, { source: '0', targets: ['1'], cards: ['strike_2c'] });
    expect(frames.some((f) => f.t === 'heal')).toBe(false);
  });
});

describe('jieyin.targeting — a wounded MALE character only', () => {
  it('accepts a wounded male, rejects a full-hp male and any female', () => {
    const G = makeGState({
      players: {
        '0': makePlayer('0'),
        '1': makePlayer('1', { generalId: 'guan_yu', hp: 2, maxHp: 4 }), // wounded male
        '2': makePlayer('2', { generalId: 'guan_yu', hp: 4, maxHp: 4 }), // full-hp male
        '3': makePlayer('3', { generalId: 'da_qiao', hp: 1, maxHp: 3 }), // wounded female
      },
      seats: ['0', '1', '2', '3'],
    });
    expect(jieyin.active!.targeting.predicate!(G, '0', '1')).toBe(true);
    expect(jieyin.active!.targeting.predicate!(G, '0', '2')).toBe(false);
    expect(jieyin.active!.targeting.predicate!(G, '0', '3')).toBe(false);
  });

  it('costs exactly 2 cards (activeCardCount)', () => {
    expect(jieyin.activeCardCount).toBe(2);
  });
});

describe('lijian.targeting — two OTHER male characters', () => {
  it('accepts males, rejects females', () => {
    const G = makeGState({
      players: {
        '0': makePlayer('0'),
        '1': makePlayer('1', { generalId: 'guan_yu' }),
        '2': makePlayer('2', { generalId: 'da_qiao' }),
      },
      seats: ['0', '1', '2'],
    });
    expect(lijian.active!.targeting.predicate!(G, '0', '1')).toBe(true);
    expect(lijian.active!.targeting.predicate!(G, '0', '2')).toBe(false);
  });

  it('costs exactly 1 card and synthesizes a duel bypassing {t:\'play\'} (unnullifiable by construction)', () => {
    const G = makeGState({
      players: { '0': makePlayer('0', { hand: ['strike_2c'] }), '1': makePlayer('1'), '2': makePlayer('2') },
      seats: ['0', '1', '2'],
    });
    const frames = lijian.active!.resolve(G, { source: '0', targets: ['1', '2'], cards: ['strike_2c'] });
    expect(frames).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'hand', player: '0' }, to: { z: 'discard' }, by: '0' },
      { t: 'effect', effectKey: 'duel', ctx: { source: '1', targets: ['2'], cards: [] } },
    ]);
    expect(lijian.activeCardCount).toBe(1);
  });
});

describe('yiji_distribute — reads the two cards {t:\'draw\'} just gave the owner', () => {
  it('asks with exactly the last two hand cards', () => {
    const G = makeGState({
      players: { '0': makePlayer('0', { hand: ['peach_3h', 'strike_2c', 'dodge_2h1'] }) },
    });
    const frames = yijiDistribute.resolve(G, { owner: '0' });
    expect(frames).toEqual([
      {
        t: 'request',
        req: { kind: 'yijiDistribute', playerId: '0', cards: ['strike_2c', 'dodge_2h1'], reasonKey: 'skill.yiji' },
      },
    ]);
  });

  it('is a no-op if the draw came up empty (deck exhausted)', () => {
    const G = makeGState({ players: { '0': makePlayer('0', { hand: [] }) } });
    expect(yijiDistribute.resolve(G, { owner: '0' })).toEqual([]);
  });
});

describe('fanjian — 周瑜 GIVES one of HIS OWN cards, not the target\'s (direction fixed post-review)', () => {
  it('canPlay requires a card in the SOURCE\'s own hand', () => {
    const G = makeGState({ players: { '0': makePlayer('0', { hand: [] }), '1': makePlayer('1') } });
    expect(fanjian.active!.canPlay(G, '0')).toBe(false);
    G.players['0'].hand = ['strike_2c'];
    expect(fanjian.active!.canPlay(G, '0')).toBe(true);
  });

  it('step 1 asks the TARGET to declare a suit', () => {
    const G = makeGState({ players: { '0': makePlayer('0', { hand: ['strike_2c'] }), '1': makePlayer('1') } });
    const frames = fanjian.active!.resolve(G, { source: '0', targets: ['1'], cards: [] });
    expect(frames).toEqual([
      { t: 'request', req: { kind: 'declareSuit', playerId: '1', reasonKey: 'skill.fanjian' } },
      { t: 'resume', effectKey: 'skill.fanjian', ctx: { source: '0', targets: ['1'], cards: [] } },
    ]);
  });

  it('step 2 asks the SOURCE to pick from THEIR OWN hand (target: source)', () => {
    const G = makeGState({ players: { '0': makePlayer('0', { hand: ['strike_2c'] }), '1': makePlayer('1') } });
    const frames = fanjian.active!.resolve(G, {
      source: '0',
      targets: ['1'],
      cards: [],
      declaredSuit: 'hearts',
    });
    expect(frames).toEqual([
      {
        t: 'request',
        req: {
          kind: 'chooseCard',
          playerId: '0',
          target: '0',
          reasonKey: 'skill.fanjian',
          choices: [{ z: 'hand', index: 0 }],
        },
      },
      {
        t: 'resume',
        effectKey: 'skill.fanjian',
        ctx: { source: '0', targets: ['1'], cards: [], declaredSuit: 'hearts', asked: true },
      },
    ]);
  });

  it('step 3 GIVES the chosen card to the target and damages on a suit mismatch', () => {
    const G = makeGState({ players: { '0': makePlayer('0', { hand: ['strike_2c'] }), '1': makePlayer('1') } });
    const frames = fanjian.active!.resolve(G, {
      source: '0',
      targets: ['1'],
      cards: [],
      declaredSuit: 'hearts', // guessed wrong — strike_2c is clubs
      asked: true,
      chosen: 'strike_2c',
      chosenZone: { z: 'hand', player: '0' },
    });
    expect(frames).toEqual([
      { t: 'moveCards', cards: ['strike_2c'], from: { z: 'hand', player: '0' }, to: { z: 'hand', player: '1' }, by: '0' },
      { t: 'log', key: 'log.card_taken', params: { player: '1', card: 'strike_2c', target: '0' } },
      { t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal' },
      { t: 'log', key: 'log.damage', params: { target: '1', n: 1, source: '0' } },
    ]);
  });

  it('no damage when the guessed suit matches', () => {
    const G = makeGState({ players: { '0': makePlayer('0', { hand: ['strike_2c'] }), '1': makePlayer('1') } });
    const frames = fanjian.active!.resolve(G, {
      source: '0',
      targets: ['1'],
      cards: [],
      declaredSuit: 'clubs', // matches strike_2c
      asked: true,
      chosen: 'strike_2c',
      chosenZone: { z: 'hand', player: '0' },
    });
    expect(frames.some((f) => f.t === 'damage')).toBe(false);
  });
});
