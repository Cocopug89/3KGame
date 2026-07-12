// 护驾 (4.4 / Batch C) — 曹操's lord skill: Wei allies may supply a 闪 for him.
// Task 4.5. The trigger is trivial; the loop lives in content/effects/lordProxy.ts,
// which 激将 shares — so the proxy's own asking/stopping behaviour is covered here
// (dodge/Wei) and in jijiang.test.ts (strike/Shu).

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { hujia } from '../../../src/content/skills/hujia.js';
import { lordProxyEffect } from '../../../src/content/effects/lordProxy.js';

const trigger = hujia.triggers![0];

describe('hujia — demand.open for a 闪 raised on the lord', () => {
  const G = makeGState();

  it('fires for a dodge demand on the owner', () => {
    expect(trigger.when({ event: 'demand.open', from: '0', kind: 'dodge', count: 1 }, G, '0')).toBe(true);
  });

  it('does not fire for a demand on somebody else, or for a demand of another kind', () => {
    expect(trigger.when({ event: 'demand.open', from: '1', kind: 'dodge', count: 1 }, G, '0')).toBe(false);
    expect(trigger.when({ event: 'demand.open', from: '0', kind: 'strike', count: 1 }, G, '0')).toBe(false);
    expect(trigger.when({ event: 'demand.open', from: '0', kind: 'peach', count: 1 }, G, '0')).toBe(false);
  });

  it('hands off to the shared proxy loop', () => {
    expect(trigger.effect({ event: 'demand.open', from: '0', kind: 'dodge', count: 1 }, G, '0')).toEqual([
      { t: 'effect', effectKey: 'hujia_proxy', ctx: { owner: '0' } },
    ]);
  });

  it('is a 主公技 in the lord priority band (300) — it must resolve after ordinary skills (§3.2)', () => {
    expect(hujia.lordOnly).toBe(true);
    expect(trigger.priority).toBe(300);
  });
});

describe('hujia_proxy — asks eligible Wei allies in seat order, stops at the first supply', () => {
  const proxy = lordProxyEffect({ key: 'hujia_proxy', kind: 'dodge', kingdom: 'wei' });

  it('asks the next Wei ally in seat order, skipping non-Wei and dead seats', () => {
    const G = makeGState({
      players: {
        '0': makePlayer('0', { generalId: 'cao_cao', role: 'lord' }), // wei, the owner
        '1': makePlayer('1', { generalId: 'guan_yu' }), // shu — skipped
        '2': makePlayer('2', { generalId: 'sima_yi' }), // wei — asked
        '3': makePlayer('3', { generalId: 'xu_chu', alive: false }), // wei but dead — skipped
      },
      seats: ['0', '1', '2', '3'],
      demand: { kind: 'dodge', from: '0', by: '1', count: 1, reasonKey: 'demand.dodge', supplied: null },
    });
    expect(proxy.resolve(G, { owner: '0' })).toEqual([
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
    const G = makeGState({
      demand: { kind: 'dodge', from: '0', by: '1', count: 1, reasonKey: 'demand.dodge', supplied: null },
    });
    expect(proxy.resolve(G, { owner: '0', order: ['2'], index: 1 })).toEqual([]);
  });
});
