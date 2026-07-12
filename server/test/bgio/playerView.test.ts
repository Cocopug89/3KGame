// Task 5.4 — the anti-cheat regression suite. See docs/anti-cheat-audit.md.
//
// Every test here is an ATTACK: it takes the exact object boardgame.io ships to
// one player's browser and asserts that a secret is not in it. The rule these
// pin (engine-design §6) is **delete hidden zones, never mask them** — a masked
// card is still a card id on the wire, and the wire is where a cheating client
// reads.
//
// The blunt instrument is `serialisedFor()`: it JSON-stringifies the whole view
// and greps for the literal secret. That catches a leak through a field nobody
// thought to test — which is how every real leak in this file was found, and how
// the next one will be.

import { describe, it, expect } from 'vitest';
import { playerView } from '../../src/bgio/playerView.js';
import { makeGState, makePlayer } from '../engine/fixtures.js';
import type { GState, PlayerId } from '../../src/engine/state.js';

// The exact object boardgame.io hands one player's browser. (ThreeKingdomsGame's
// `playerView` property IS this function — game.ts imports it; the drift guard is
// that there is only one definition of it in the tree.)
const view = (G: GState, playerID: PlayerId | null): Record<string, unknown> =>
  playerView({ G, playerID }) as unknown as Record<string, unknown>;

const serialisedFor = (G: GState, playerID: PlayerId | null): string =>
  JSON.stringify(view(G, playerID));

/** 0 = the viewer. 1 = the opponent whose secrets we try to read. */
function table(overrides: Partial<GState> = {}): GState {
  return makeGState({
    players: {
      '0': makePlayer('0', { hand: ['peach_3h'], role: 'rebel' }),
      '1': makePlayer('1', {
        hand: ['strike_2c', 'dodge_2h1'],
        role: 'traitor',
        flags: { 'secret.plan': 'betray', 'pub.mark': 1 },
      }),
    },
    seats: ['0', '1'],
    drawPile: ['lightning_1s', 'duel_1s'],
    ...overrides,
  });
}

describe('playerView — hidden zones are DELETED, not masked', () => {
  it('never ships the draw pile, in any form, to anyone', () => {
    const G = table();
    const v = view(G, '0');
    expect(v.drawPile).toBeUndefined();
    expect(v.drawPileCount).toBe(2);
    expect(serialisedFor(G, '0')).not.toContain('lightning_1s');
    // ...and not to a spectator / the master view either.
    expect(serialisedFor(G, null)).not.toContain('lightning_1s');
  });

  it('never ships the stack — frames carry card ids in their ctx (the chosen card, the drawn ids)', () => {
    const G = table({
      stack: [{ t: 'resume', effectKey: 'fankui_take', ctx: { owner: '0', chosen: 'strike_2c' } }],
    });
    expect(view(G, '0').stack).toBeUndefined();
    expect(serialisedFor(G, '0')).not.toContain('fankui_take');
  });

  it('strips another player\'s hand to a count — the ids never leave the server', () => {
    const G = table();
    const v = view(G, '0') as { players: Record<string, Record<string, unknown>> };
    expect(v.players['1'].hand).toBeUndefined();
    expect(v.players['1'].handCount).toBe(2);
    expect(serialisedFor(G, '0')).not.toContain('strike_2c');
    expect(serialisedFor(G, '0')).not.toContain('dodge_2h1');
  });

  it('gives a player their OWN hand in full', () => {
    const v = view(table(), '0') as { players: Record<string, Record<string, unknown>> };
    expect(v.players['0'].hand).toEqual(['peach_3h']);
  });
});

describe('playerView — roles and flags', () => {
  it('hides an unrevealed role, and reveals one that is flipped', () => {
    const G = table();
    expect(serialisedFor(G, '0')).not.toContain('traitor');

    G.players['1'].roleRevealed = true;
    const v = view(G, '0') as { players: Record<string, Record<string, unknown>> };
    expect(v.players['1'].role).toBe('traitor');
  });

  it('sends only pub.* flags of other players (F2), and all of your own', () => {
    const G = table();
    const v = view(G, '0') as { players: Record<string, Record<string, unknown>> };
    expect(v.players['1'].flags).toEqual({ 'pub.mark': 1 });
    expect(serialisedFor(G, '0')).not.toContain('betray');
    expect(v.players['0'].flags).toEqual({});
  });
});

describe('playerView — the pending request is a private channel', () => {
  it('sends the full payload to the player being asked, and only {kind, waitingOn} to everyone else', () => {
    const G = table({
      pending: { kind: 'guanxing', playerId: '1', cards: ['lightning_1s', 'duel_1s'], reasonKey: 'skill.guanxing' },
    });

    // 诸葛亮 himself sees the top of the draw pile — that IS the skill (§6).
    expect(view(G, '1').pending).toEqual(G.pending);

    // Nobody else sees a single one of those card ids.
    expect(view(G, '0').pending).toEqual({ waitingOn: '1', kind: 'guanxing' });
    expect(serialisedFor(G, '0')).not.toContain('lightning_1s');
    expect(serialisedFor(G, null)).not.toContain('lightning_1s');
  });

  it('a chooseCard request offers SLOTS, never ids — so even its owner cannot read the victim\'s hand', () => {
    const G = table({
      pending: {
        kind: 'chooseCard',
        playerId: '0',
        target: '1',
        reasonKey: 'choose.fankui',
        choices: [
          { z: 'hand', index: 0 },
          { z: 'hand', index: 1 },
        ],
      },
    });
    // The attacker is the one being asked, so they get the whole payload — and it
    // still tells them nothing (judgement-nullification-design §5).
    expect(serialisedFor(G, '0')).not.toContain('strike_2c');
    expect(serialisedFor(G, '0')).not.toContain('dodge_2h1');
  });

  it('a yijiDistribute request names the owner\'s OWN drawn cards, to the owner only', () => {
    const G = table({
      pending: { kind: 'yijiDistribute', playerId: '1', cards: ['strike_2c', 'dodge_2h1'], reasonKey: 'skill.yiji' },
    });
    expect(serialisedFor(G, '0')).not.toContain('strike_2c');
  });
});

describe('playerView — the public log must not name a hidden card (the 5.4 finding)', () => {
  it('does not name a card taken out of a hidden hand by 反馈 / 突袭', () => {
    const G = table({
      log: [{ key: 'log.card_taken_hidden', params: { player: '0', target: '1' } }],
    });
    // The whole log is public — this is precisely why the emitter must not put
    // the card id in it. A regression to 'log.card_taken' with a `card` param
    // fails here for every viewer at the table.
    //
    // Scoped to the LOG, not the whole view, for one honest reason: player 1 is
    // the victim, and the victim can of course still see their own hand (they
    // watched the card leave it). The secret being protected here is what the
    // THIRD parties learn — and the log is what would have told them.
    for (const viewer of ['0', '1', null] as (PlayerId | null)[]) {
      const log = (view(G, viewer) as { log: unknown[] }).log;
      expect(JSON.stringify(log)).not.toContain('strike_2c');
    }
    // Third parties additionally learn nothing about the victim's hand anywhere
    // else in the view.
    expect(serialisedFor(G, '0')).not.toContain('strike_2c');
  });

  it('still names a card that was already face up (a played 杀, a stolen weapon)', () => {
    const G = table({
      discardPile: ['strike_2c'],
      log: [{ key: 'log.plays_at', params: { player: '1', card: 'strike_2c', target: '0' } }],
    });
    expect(serialisedFor(G, '0')).toContain('log.plays_at');
    const v = view(G, '0') as { log: unknown[] };
    expect(v.log).toHaveLength(1);
  });
});

describe('playerView — what is deliberately PUBLIC stays public', () => {
  it('ships judgement, damage, demand, the revealed pool and the discard pile to everyone', () => {
    const G = table({
      discardPile: ['peach_3h'],
      revealed: ['strike_2c'],
      judgement: { target: '1', cardId: 'lightning_1s', reasonKey: 'judge.lightning' },
      damage: { source: '0', target: '1', amount: 1, kind: 'normal', card: 'strike_2c', seq: 1 },
      demand: { kind: 'dodge', from: '1', by: '0', count: 1, reasonKey: 'demand.dodge', supplied: null },
    });
    const v = view(G, '0');
    // A flipped judgement card, a 杀 landing and a player being asked for a 闪
    // are all face up at a real table — and a retrial skill in someone's hand is
    // only playable BECAUSE they can see the judgement.
    expect(v.judgement).toEqual(G.judgement);
    expect(v.damage).toEqual(G.damage);
    expect(v.demand).toEqual(G.demand);
    expect(v.revealed).toEqual(['strike_2c']);
    expect(v.discardPile).toEqual(['peach_3h']);
  });
});

describe('playerView — the general-selection window (5.2)', () => {
  const selecting = () =>
    table({
      selection: {
        lord: '0',
        awaiting: ['1'],
        candidates: { '0': ['cao_cao', 'liu_bei'], '1': ['guan_yu', 'zhang_fei'] },
        picked: { '0': 'cao_cao' },
      } as never,
    });

  it('sends a player only their OWN candidates', () => {
    const G = selecting();
    const v = view(G, '1') as { selection: { candidates: string[] } };
    expect(v.selection.candidates).toEqual(['guan_yu', 'zhang_fei']);
    // Seeing an opponent's options is a real information advantage (selection.ts).
    expect(serialisedFor(G, '1')).not.toContain('liu_bei');
  });

  it('publishes the Lord\'s pick (they choose in the open) and the FACT that others have locked in', () => {
    const v = view(selecting(), '1') as {
      selection: { lordGeneralId: string; lockedIn: string[]; myPick: string | null };
    };
    expect(v.selection.lordGeneralId).toBe('cao_cao');
    expect(v.selection.lockedIn).toEqual(['0']);
    expect(v.selection.myPick).toBeNull();
  });

  it('never ships the raw selection object — an unpicked candidate list is a secret', () => {
    const G = selecting();
    const v = view(G, '1') as { selection: Record<string, unknown> };
    expect(v.selection.candidates).not.toEqual(G.selection!.candidates);
    expect(v.selection.picked).toBeUndefined();
  });
});
