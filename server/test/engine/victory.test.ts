// Task 5.3 — win conditions, the hidden-role reveal, and 奖惩 (the kill
// reward/penalty). Two layers, deliberately:
//
//   • winnersFor/checkVictory in isolation (they're a pure fold over roles and
//     `alive` — the four objectives from plan §2, and the edge everyone gets
//     wrong: the Traitor wins ONLY as the last player standing, so a Lord who
//     dies with anyone else still alive hands it to the Rebels, even when every
//     Rebel is already dead);
//   • the whole death path through pump() — dying window closes, the role flips
//     face up, the killer collects (or the Lord pays), and the game may end —
//     because the ORDER of those is the part that can regress silently.

import { describe, it, expect } from 'vitest';
import { pump } from '../../src/engine/pump.js';
import { checkVictory, livingPlayers, winnersFor } from '../../src/engine/victory.js';
import { deathConsequenceFrames, resolveDeath } from '../../src/engine/dying.js';
import { makeGState, makePlayer, identityRng } from './fixtures.js';
import type { GState, Role } from '../../src/engine/state.js';
import { cards } from '@3k/shared';

/** '0' Lord · '1' Loyalist · '2' Rebel · '3' Traitor — the 4-player deal. */
function table(overrides: Partial<GState> = {}): GState {
  const roles: Role[] = ['lord', 'loyalist', 'rebel', 'traitor'];
  return makeGState({
    players: Object.fromEntries(
      roles.map((role, i) => [
        String(i),
        makePlayer(String(i), { role, roleRevealed: role === 'lord', hp: 4, maxHp: 4 }),
      ]),
    ),
    seats: ['0', '1', '2', '3'],
    ...overrides,
  });
}

const kill = (G: GState, id: string) => {
  G.players[id].alive = false;
};

describe('winnersFor', () => {
  it('is null while the game is still on', () => {
    expect(winnersFor(table())).toBeNull();
  });

  it('is null while a single Rebel is alive, even with the Traitor dead', () => {
    const G = table();
    kill(G, '3');
    expect(winnersFor(G)).toBeNull();
  });

  it('gives it to the Lord and the Loyalists once no Rebel and no Traitor is alive', () => {
    const G = table();
    kill(G, '2');
    kill(G, '3');
    expect(winnersFor(G)).toEqual({ winners: ['0', '1'], condition: 'lord' });
  });

  it('still gives it to a DEAD Loyalist — the side wins, not the survivors', () => {
    const G = table();
    kill(G, '1');
    kill(G, '2');
    kill(G, '3');
    expect(winnersFor(G)).toEqual({ winners: ['0', '1'], condition: 'lord' });
  });

  it('gives it to the Rebels when the Lord dies with anyone else still at the table', () => {
    const G = table();
    kill(G, '0');
    expect(winnersFor(G)).toEqual({ winners: ['2'], condition: 'rebel' });
  });

  it('STILL gives it to the Rebels when the Lord dies and every Rebel is already dead', () => {
    // The Traitor killed the Lord but the Loyalist is alive, so the Traitor is
    // not last standing — and the rule is not "whoever is left": it's the
    // Rebels' win, even posthumously. This is the case a "last side alive"
    // shortcut gets wrong.
    const G = table();
    kill(G, '2');
    kill(G, '0');
    expect(winnersFor(G)).toEqual({ winners: ['2'], condition: 'rebel' });
  });

  it('gives it to the Traitor only as the last player standing', () => {
    const G = table();
    kill(G, '1');
    kill(G, '2');
    kill(G, '0');
    expect(livingPlayers(G)).toEqual(['3']);
    expect(winnersFor(G)).toEqual({ winners: ['3'], condition: 'traitor' });
  });

  it('never ends a table with no Lord (the engine fixtures build those)', () => {
    const G = makeGState(); // two rebels, no lord
    expect(winnersFor(G)).toBeNull();
  });
});

describe('checkVictory', () => {
  it('turns every hidden role face up when the game ends — that IS the reveal', () => {
    const G = table();
    kill(G, '2');
    kill(G, '3');
    expect(G.players['1'].roleRevealed).toBe(false);

    expect(checkVictory(G)).toBe(true);
    expect(G.gameOver).toEqual({ winners: ['0', '1'], condition: 'lord' });
    for (const id of G.seats) {
      expect(G.players[id].roleRevealed).toBe(true);
    }
    expect(G.log.at(-1)).toEqual({ key: 'log.game_over', params: { role: 'lord' } });
  });

  it('reveals nothing while the game is on', () => {
    const G = table();
    expect(checkVictory(G)).toBe(false);
    expect(G.gameOver).toBeUndefined();
    expect(G.players['2'].roleRevealed).toBe(false);
    expect(G.log).toEqual([]);
  });

  it('is idempotent — a second death can not re-decide a finished game', () => {
    const G = table();
    kill(G, '2');
    kill(G, '3');
    checkVictory(G);
    kill(G, '0'); // impossible, but the guard is what stops a rewrite
    expect(checkVictory(G)).toBe(true);
    expect(G.gameOver?.condition).toBe('lord');
    expect(G.log.filter((e) => e.key === 'log.game_over')).toHaveLength(1);
  });
});

// ── 奖惩 (plan §2) ────────────────────────────────────────────────────────

const STRIKES = cards.filter((c) => c.effectKey === 'strike').map((c) => c.id);
const CROSSBOW = cards.find((c) => c.effectKey === 'zhuge_crossbow')?.id;

describe('deathConsequenceFrames', () => {
  it('pays the killer of a Rebel three cards', () => {
    const G = table();
    resolveDeath(G, '2', '0');
    expect(deathConsequenceFrames(G, '2', '0')).toEqual([{ t: 'draw', player: '0', count: 3 }]);
    expect(G.log.at(-1)).toEqual({ key: 'log.kill_reward', params: { player: '0', n: 3 } });
  });

  it('pays a Rebel-killing Rebel too — the bounty is on the role, not the side', () => {
    const G = table();
    resolveDeath(G, '2', '3');
    expect(deathConsequenceFrames(G, '2', '3')).toEqual([{ t: 'draw', player: '3', count: 3 }]);
  });

  it('strips the Lord of everything for killing a Loyalist', () => {
    const G = table();
    G.players['0'].hand = [STRIKES[0], STRIKES[1]];
    G.players['0'].equipment.weapon = CROSSBOW!;
    resolveDeath(G, '1', '0');

    expect(deathConsequenceFrames(G, '1', '0')).toEqual([
      {
        t: 'moveCards',
        cards: [STRIKES[0], STRIKES[1]],
        from: { z: 'hand', player: '0' },
        to: { z: 'discard' },
        by: '0',
      },
      {
        t: 'moveCards',
        cards: [CROSSBOW],
        from: { z: 'equip', player: '0' },
        to: { z: 'discard' },
        by: '0',
      },
    ]);
    expect(G.log.at(-1)).toEqual({ key: 'log.kill_penalty', params: { player: '0' } });
  });

  it('does not punish a Rebel for killing a Loyalist — only the Lord pays', () => {
    const G = table();
    G.players['2'].hand = [STRIKES[0]];
    resolveDeath(G, '1', '2');
    expect(deathConsequenceFrames(G, '1', '2')).toEqual([]);
  });

  it('pays nothing for a Traitor or the Lord', () => {
    const G = table();
    resolveDeath(G, '3', '0');
    expect(deathConsequenceFrames(G, '3', '0')).toEqual([]);
    const H = table();
    resolveDeath(H, '0', '2');
    expect(deathConsequenceFrames(H, '0', '2')).toEqual([]);
  });

  it('pays nothing when there is no killer (闪电, a self-inflicted backfire)', () => {
    const G = table();
    resolveDeath(G, '2', null);
    expect(deathConsequenceFrames(G, '2', null)).toEqual([]);
    expect(deathConsequenceFrames(G, '2', '2')).toEqual([]); // killed yourself
  });

  it('pays nothing to a killer who died in the same resolution — a corpse draws no cards', () => {
    const G = table();
    resolveDeath(G, '0', null); // the Lord went first (决斗 backfire)
    resolveDeath(G, '2', '0');
    expect(deathConsequenceFrames(G, '2', '0')).toEqual([]);
  });
});

// ── the whole path, through pump() ────────────────────────────────────────

describe('death through pump()', () => {
  /** Nobody holds a 桃, so the dying window closes on the first pass. */
  function dyingTable(overrides: Partial<GState> = {}): GState {
    const G = table({ drawPile: [...STRIKES], ...overrides });
    G.players['2'].hp = 0;
    return G;
  }

  it('reveals the role, discards the corpse’s cards, and pays the killer — in that order', () => {
    const G = dyingTable();
    G.players['2'].hand = [STRIKES.at(-1)!];
    G.stack = [{ t: 'dying', target: '2', asker: '2', offset: 0, killer: '0' }];
    pump(G, identityRng);

    expect(G.players['2'].alive).toBe(false);
    expect(G.players['2'].roleRevealed).toBe(true);
    expect(G.discardPile).toContain(STRIKES.at(-1));
    expect(G.players['0'].hand).toHaveLength(3); // the Rebel bounty, actually drawn
    expect(G.gameOver).toBeUndefined(); // the Traitor is still out there
    // (the draw itself doesn't log — F3's `log.draws` is still unwritten)
    expect(G.log.map((e) => e.key)).toEqual(['log.death', 'log.kill_reward']);
  });

  it('logs the dead player’s role — the log line IS the reveal, for the renderer', () => {
    const G = dyingTable();
    G.stack = [{ t: 'dying', target: '2', asker: '2', offset: 0, killer: null }];
    pump(G, identityRng);
    expect(G.log[0]).toEqual({ key: 'log.death', params: { target: '2', role: 'rebel' } });
  });

  it('ends the game instead of paying, when the death is the last one that matters', () => {
    // The Traitor is already gone: killing the last Rebel wins it for the Lord,
    // and a reward drawn into a finished game is noise. pump() halts on
    // G.gameOver, so the draw frame would never have resolved anyway — this
    // asserts we don't even push it.
    const G = dyingTable();
    kill(G, '3');
    G.stack = [{ t: 'dying', target: '2', asker: '2', offset: 0, killer: '0' }];
    pump(G, identityRng);

    expect(G.gameOver).toEqual({ winners: ['0', '1'], condition: 'lord' });
    expect(G.players['0'].hand).toHaveLength(0); // no bounty
    expect(G.players['3'].roleRevealed).toBe(true); // everyone is face up now
    expect(G.log.map((e) => e.key)).toEqual(['log.death', 'log.game_over']);
  });

  it('strips the Lord bare when the Lord kills a Loyalist, and plays on', () => {
    const G = table({ drawPile: [...STRIKES] });
    G.players['1'].hp = 0;
    G.players['0'].hand = [STRIKES[0], STRIKES[1]];
    G.players['0'].equipment.weapon = CROSSBOW!;
    G.stack = [{ t: 'dying', target: '1', asker: '1', offset: 0, killer: '0' }];
    pump(G, identityRng);

    expect(G.players['0'].hand).toEqual([]);
    expect(G.players['0'].equipment.weapon).toBeNull();
    expect(G.discardPile).toContain(STRIKES[0]);
    expect(G.discardPile).toContain(CROSSBOW);
    expect(G.gameOver).toBeUndefined();
  });

  it('ends the game the moment the Lord dies', () => {
    const G = table({ drawPile: [...STRIKES] });
    G.players['0'].hp = 0;
    G.stack = [{ t: 'dying', target: '0', asker: '0', offset: 0, killer: '2' }];
    pump(G, identityRng);

    expect(G.gameOver).toEqual({ winners: ['2'], condition: 'rebel' });
    expect(G.players['3'].roleRevealed).toBe(true);
    expect(G.players['2'].hand).toHaveLength(0); // no bounty for killing the Lord
  });
});
