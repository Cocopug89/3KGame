// The trigger fan-out — docs/skill-trigger-design.md §3, implemented in 3.2
// (per that doc's §0.5, because judgement retrial and every 3.6 weapon need it
// long before Phase 4).
//
// §3.3 is the whole game here, and it is TWO rules that are easy to conflate:
//
//   * the sorted list is a SNAPSHOT — it fixes the ORDER, and only the order
//   * each step RE-DERIVES eligibility when it pops — alive, still owns the
//     trigger, when() still true
//
// A fan-out that snapshots closures and runs them blind is the exact bug the
// "derive, never subscribe" architecture exists to prevent; re-deriving the
// whole *list* per step instead would let a listener insert new listeners into
// its own fan-out. Both halves, or it's wrong. These tests pin both.

import { describe, it, expect, afterEach } from 'vitest';
import { pump, resolve } from '../../src/engine/pump.js';
import { collectListeners, seatOrderFromTurnPlayer } from '../../src/engine/triggers.js';
import { equipmentTriggerRegistry } from '../../src/content/equipmentTriggerRegistry.js';
import { PRIORITY_EQUIPMENT, PRIORITY_SKILL } from '../../src/content/triggerTypes.js';
import type { SkillTrigger } from '../../src/content/triggerTypes.js';
import { makeGState, makePlayer, identityRng } from './fixtures.js';
import type { GState } from '../../src/engine/state.js';

/** Registers a trigger against a real equipment effectKey for one test — the
 * same door 3.6's weapons walk through. Records fire order into `fired`. */
function registerEquipTrigger(
  effectKey: string,
  trigger: Partial<SkillTrigger> & { id: string },
  fired: string[],
): void {
  equipmentTriggerRegistry[effectKey] = [
    {
      event: 'card.play',
      optional: false,
      priority: PRIORITY_EQUIPMENT,
      when: () => true,
      effect: (_e, _G, owner) => {
        fired.push(`${trigger.id}@${owner}`);
        return [];
      },
      ...trigger,
    } as SkillTrigger,
  ];
}

const TOUCHED = ['green_dragon_blade', 'renwang_shield', 'eight_trigrams'];
afterEach(() => {
  for (const k of TOUCHED) delete equipmentTriggerRegistry[k];
});

function fourPlayers(): GState {
  return makeGState({
    players: {
      '0': makePlayer('0'),
      '1': makePlayer('1'),
      '2': makePlayer('2'),
      '3': makePlayer('3'),
    },
    seats: ['0', '1', '2', '3'],
    activeSeat: 2, // the turn player is '2' — the seat-order tiebreak starts HERE
  });
}

const PLAY_EV = {
  event: 'card.play',
  source: '0',
  cards: ['strike_2c'],
  targets: [],
  effectKey: 'strike',
} as const;

describe('seatOrderFromTurnPlayer', () => {
  it('starts at the current turn player and walks living seats clockwise', () => {
    const G = fourPlayers();
    expect(seatOrderFromTurnPlayer(G)).toEqual(['2', '3', '0', '1']);
    G.players['3'].alive = false;
    expect(seatOrderFromTurnPlayer(G)).toEqual(['2', '0', '1']);
  });
});

describe('collectListeners (§3.1)', () => {
  it('sorts by priority first — equipment (100) before skills (200) on the same event', () => {
    const fired: string[] = [];
    registerEquipTrigger('renwang_shield', { id: 'equip.renwang' }, fired);
    registerEquipTrigger(
      'green_dragon_blade',
      { id: 'skillish.late', priority: PRIORITY_SKILL },
      fired,
    );
    const G = fourPlayers();
    G.players['0'].equipment.weapon = 'green_dragon_blade_5s'; // priority 200
    G.players['0'].equipment.armour = 'renwang_shield_2c'; // priority 100

    expect(collectListeners(G, PLAY_EV).map((l) => l.triggerId)).toEqual([
      'equip.renwang',
      'skillish.late',
    ]);
  });

  it('breaks priority ties by SEAT ORDER FROM THE TURN PLAYER, not by player id', () => {
    const fired: string[] = [];
    registerEquipTrigger('renwang_shield', { id: 'equip.renwang' }, fired);
    const G = fourPlayers(); // turn player is '2'
    for (const id of ['0', '1', '2', '3']) G.players[id].equipment.armour = 'renwang_shield_2c';

    // NOT ['0','1','2','3'] — that's the bug this rule exists to prevent.
    expect(collectListeners(G, PLAY_EV).map((l) => l.owner)).toEqual(['2', '3', '0', '1']);
  });

  it('skips a listener whose when() is false, and the dead entirely', () => {
    const fired: string[] = [];
    registerEquipTrigger('renwang_shield', { id: 'equip.renwang', when: (_e, _G, o) => o !== '3' }, fired);
    const G = fourPlayers();
    for (const id of ['0', '1', '2', '3']) G.players[id].equipment.armour = 'renwang_shield_2c';
    G.players['0'].alive = false;

    expect(collectListeners(G, PLAY_EV).map((l) => l.owner)).toEqual(['2', '1']);
  });
});

describe("resolve('trigger') / resolve('triggerStep') (§3.3)", () => {
  it('fans out into one triggerStep per listener, and they run in the snapshot order', () => {
    const fired: string[] = [];
    registerEquipTrigger('renwang_shield', { id: 'equip.renwang' }, fired);
    const G = fourPlayers();
    for (const id of ['2', '3', '0']) G.players[id].equipment.armour = 'renwang_shield_2c';

    G.stack.push({ t: 'trigger', ev: PLAY_EV });
    pump(G, identityRng);

    expect(fired).toEqual(['equip.renwang@2', 'equip.renwang@3', 'equip.renwang@0']);
  });

  it('RE-CHECKS at pop time: a listener that loses its equipment mid-fan-out never fires', () => {
    // The 青釭剑 case from engine-design §4, made concrete: an earlier listener
    // discards a later one's armour. A blind snapshot would fire it anyway.
    const fired: string[] = [];
    const G = fourPlayers();
    for (const id of ['2', '3']) G.players[id].equipment.armour = 'renwang_shield_2c';
    equipmentTriggerRegistry['renwang_shield'] = [
      {
        id: 'equip.renwang',
        event: 'card.play',
        optional: false,
        priority: PRIORITY_EQUIPMENT,
        when: () => true,
        effect: (_e, _G, owner) => {
          fired.push(owner);
          // '2' (first) rips the armour off '3' (queued behind them).
          if (owner === '2') {
            return [
              {
                t: 'moveCards',
                cards: ['renwang_shield_2c'],
                from: { z: 'equip', player: '3' },
                to: { z: 'discard' },
              },
            ];
          }
          return [];
        },
      },
    ];

    G.stack.push({ t: 'trigger', ev: PLAY_EV });
    pump(G, identityRng);

    expect(fired).toEqual(['2']); // '3' was in the snapshot but is no longer eligible
    expect(G.players['3'].equipment.armour).toBeNull();
  });

  it("RE-CHECKS when(): a listener falsified by an earlier one in the same fan-out drops silently", () => {
    const fired: string[] = [];
    const G = fourPlayers();
    for (const id of ['2', '3']) G.players[id].equipment.armour = 'renwang_shield_2c';
    G.players['3'].hand = ['strike_2c'];
    equipmentTriggerRegistry['renwang_shield'] = [
      {
        id: 'equip.renwang',
        event: 'card.play',
        optional: false,
        priority: PRIORITY_EQUIPMENT,
        // Eligible only while the owner holds a card — true for '3' at snapshot.
        when: (_e, G2, owner) => G2.players[owner].hand.length > 0 || owner === '2',
        effect: (_e, _G, owner) => {
          fired.push(owner);
          if (owner === '2') {
            return [
              {
                t: 'moveCards',
                cards: ['strike_2c'],
                from: { z: 'hand', player: '3' },
                to: { z: 'discard' },
              },
            ];
          }
          return [];
        },
      },
    ];

    G.stack.push({ t: 'trigger', ev: PLAY_EV });
    pump(G, identityRng);

    expect(fired).toEqual(['2']);
  });

  it('a fan-out with no listeners is a no-op, not a stub (the Phase 3 normal case)', () => {
    const G = fourPlayers();
    G.stack.push({ t: 'trigger', ev: PLAY_EV });
    expect(() => pump(G, identityRng)).not.toThrow();
    expect(G.stack).toEqual([]);
  });

  it('an OPTIONAL trigger asks its owner first — one confirmSkill request, and nothing runs yet (§3.4)', () => {
    // 3.2 threw here rather than silently running a skill the player never
    // agreed to. 4.1b answers the question properly: the step pushes a yes/no
    // request and stops. A "yes" (the respondSkill move) re-pushes the very
    // same step with `confirmed`; a "no" pushes nothing at all, and declining
    // therefore costs the player nothing — not even the skill's once-per-turn.
    const fired: string[] = [];
    registerEquipTrigger('renwang_shield', { id: 'equip.renwang', optional: true }, fired);
    const G = fourPlayers();
    G.players['2'].equipment.armour = 'renwang_shield_2c';
    G.stack.push({ t: 'trigger', ev: PLAY_EV });
    pump(G, identityRng);

    expect(G.pending).toMatchObject({
      kind: 'confirmSkill',
      playerId: '2',
      triggerId: 'equip.renwang',
    });
    expect(fired).toEqual([]); // asked, not run
  });
});
