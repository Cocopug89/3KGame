// 激将 (4.4 / Batch C) — 刘备's lord skill: Shu allies may supply a 杀 for him.
// Task 4.5. Same shape as 护驾 (hujia.ts), registered under kingdom 'shu' and
// demand kind 'strike' — this file pins the two things that DIFFER, plus the
// proxy loop's Shu-side behaviour.

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { jijiang } from '../../../src/content/skills/jijiang.js';
import { lordProxyEffect } from '../../../src/content/effects/lordProxy.js';

const trigger = jijiang.triggers![0];

describe('jijiang — demand.open for a 杀 raised on the lord', () => {
  const G = makeGState();

  it('fires for a strike demand on the owner (a 决斗 he is in, or a 杀 he must answer with)', () => {
    expect(trigger.when({ event: 'demand.open', from: '0', kind: 'strike', count: 1 }, G, '0')).toBe(true);
  });

  it('does NOT fire for a dodge demand — that is 护驾, the Wei mirror', () => {
    expect(trigger.when({ event: 'demand.open', from: '0', kind: 'dodge', count: 1 }, G, '0')).toBe(false);
  });

  it('does not fire for a demand raised on anybody else', () => {
    expect(trigger.when({ event: 'demand.open', from: '1', kind: 'strike', count: 1 }, G, '0')).toBe(false);
  });

  it('hands off to the shu proxy loop', () => {
    expect(trigger.effect({ event: 'demand.open', from: '0', kind: 'strike', count: 1 }, G, '0')).toEqual([
      { t: 'effect', effectKey: 'jijiang_proxy', ctx: { owner: '0' } },
    ]);
  });

  it('is a 主公技 in the lord priority band (300)', () => {
    expect(jijiang.lordOnly).toBe(true);
    expect(trigger.priority).toBe(300);
  });
});

describe('jijiang_proxy — the Shu/strike instance of the shared loop', () => {
  const proxy = lordProxyEffect({ key: 'jijiang_proxy', kind: 'strike', kingdom: 'shu' });

  it('asks living Shu allies in seat order, skipping the lord himself and every other kingdom', () => {
    const G = makeGState({
      players: {
        '0': makePlayer('0', { generalId: 'liu_bei', role: 'lord' }), // shu, the owner
        '1': makePlayer('1', { generalId: 'sima_yi' }), // wei — skipped
        '2': makePlayer('2', { generalId: 'guan_yu' }), // shu — asked
        '3': makePlayer('3', { generalId: 'zhang_fei', alive: false }), // shu but dead — skipped
      },
      seats: ['0', '1', '2', '3'],
      demand: { kind: 'strike', from: '0', by: '1', count: 1, reasonKey: 'demand.strike', supplied: null },
    });
    expect(proxy.resolve(G, { owner: '0' })).toEqual([
      {
        t: 'request',
        req: { kind: 'demandCard', playerId: '2', demandKind: 'strike', count: 1, reasonKey: 'demand.strike_duel' },
      },
      { t: 'resume', effectKey: 'jijiang_proxy', ctx: { owner: '0', order: ['2'], index: 1 } },
    ]);
  });

  it('stops the moment an ally has supplied — one 杀 is enough', () => {
    const G = makeGState({
      demand: { kind: 'strike', from: '0', by: '1', count: 1, reasonKey: 'demand.strike', supplied: ['strike_2c'] },
    });
    expect(proxy.resolve(G, { owner: '0', order: ['2'], index: 0 })).toEqual([]);
  });
});
