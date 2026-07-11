// A scripted sequence of snapshots (task 6.3), for the dev harness.
//
// Animations are triggered by the *difference* between consecutive states, so a
// single fixture can't show one — you need a before and an after. This is the
// shortest script that exercises every event the diff can produce: a 杀 is
// played (card lands on the discard pile), the target declines to 闪 (damage),
// the hit is lethal (dying window opens), nobody spends a 桃 (death, role
// revealed), and the turn moves on.
//
// These are hand-written *views*, not engine output — the engine can't produce
// them for the client until Phase 5 wires a match. Each step is exactly what
// playerView() would send seat 1 at that moment, which is also why this doubles
// as a check that the board handles a whole exchange from one seat's eyes.

import { cards, generals } from '@3k/shared';
import type { AnyPlayerView, Role, TableState } from './viewTypes.js';

const id = (effectKey: string, i = 0) => cards.filter((c) => c.effectKey === effectKey)[i].id;

const ROLES: Role[] = ['lord', 'loyalist', 'rebel', 'traitor'];

/** The viewer is seat 1 (a loyalist), and it is seat 0 (the lord) acting. */
const VIEWER = '1';

interface StepSpec {
  hp: [number, number, number, number];
  alive?: [boolean, boolean, boolean, boolean];
  revealed?: [boolean, boolean, boolean, boolean];
  hands: [number, number, number, number];
  /** Seat 1's actual cards (the viewer's — the only hand we're allowed to see). */
  viewerHand: string[];
  discardPile: string[];
  pending: TableState['pending'];
  turnPhase: TableState['turnPhase'];
  activeSeat: number;
  log: TableState['log'];
  strikesPlayed?: number;
}

function step(spec: StepSpec): TableState {
  const players: Record<string, AnyPlayerView> = {};
  for (let i = 0; i < 4; i += 1) {
    const general = generals[i];
    const isLord = i === 0;
    const maxHp = general.maxHp + (isLord ? 1 : 0);
    const revealed = spec.revealed?.[i] ?? isLord;
    const base = {
      id: String(i),
      seat: i,
      roleRevealed: revealed,
      generalId: general.id,
      maxHp,
      hp: spec.hp[i],
      alive: spec.alive?.[i] ?? true,
      equipment: { weapon: null, armour: null, plusHorse: null, minusHorse: null },
      judgementZone: [],
      flags: {},
    };
    players[String(i)] =
      String(i) === VIEWER
        ? { ...base, role: ROLES[i], hand: spec.viewerHand }
        : { ...base, handCount: spec.hands[i], ...(revealed ? { role: ROLES[i] } : {}) };
  }

  return {
    drawPileCount: 40,
    discardPile: spec.discardPile,
    players,
    seats: ['0', '1', '2', '3'],
    activeSeat: spec.activeSeat,
    turnPhase: spec.turnPhase,
    skipPhases: [],
    turnFlags: { strikesPlayed: spec.strikesPlayed ?? 0, strikeLimit: 1 },
    pending: spec.pending,
    log: spec.log,
  };
}

const STRIKE = id('strike');
const DODGE = id('dodge');
const PEACH = id('peach');

// Seat 1 starts wounded at 1 hp, holding no 闪 and no 桃 — so the 杀 that arrives
// is lethal and the whole chain plays out.
const HAND_BEFORE = [id('strike', 1), id('dismantle'), id('draw_two')];

const log0: TableState['log'] = [
  { key: 'log.turn_start', params: { player: '0' } },
  { key: 'log.draws', params: { player: '0', n: 2 } },
];

export const SCENARIO_STEPS: { label: string; state: TableState }[] = [
  {
    label: '0 · lord’s action phase',
    state: step({
      hp: [4, 1, 3, 3],
      hands: [5, 3, 4, 4],
      viewerHand: HAND_BEFORE,
      discardPile: [],
      pending: { kind: 'act', waitingOn: '0' },
      turnPhase: 'action',
      activeSeat: 0,
      log: log0,
    }),
  },
  {
    label: '1 · 杀 played at you  → card flies to the pile, you’re asked for a 闪',
    state: step({
      hp: [4, 1, 3, 3],
      hands: [4, 3, 4, 4],
      viewerHand: HAND_BEFORE,
      discardPile: [STRIKE],
      pending: {
        kind: 'demandCard',
        playerId: VIEWER,
        demandKind: 'dodge',
        count: 1,
        reasonKey: 'demand.dodge',
        subject: '0',
      },
      turnPhase: 'action',
      activeSeat: 0,
      strikesPlayed: 1,
      log: [...log0, { key: 'log.plays_at', params: { player: '0', card: STRIKE, target: '1' } }],
    }),
  },
  {
    label: '2 · you decline  → 1 damage, and at 0 hp the dying window opens',
    state: step({
      hp: [4, 0, 3, 3],
      hands: [4, 3, 4, 4],
      viewerHand: HAND_BEFORE,
      discardPile: [STRIKE],
      pending: {
        kind: 'demandCard',
        playerId: VIEWER,
        demandKind: 'peach',
        count: 1,
        reasonKey: 'demand.peach',
        subject: VIEWER,
      },
      turnPhase: 'action',
      activeSeat: 0,
      strikesPlayed: 1,
      log: [
        ...log0,
        { key: 'log.plays_at', params: { player: '0', card: STRIKE, target: '1' } },
        { key: 'log.declines', params: { player: '1' } },
        { key: 'log.damage', params: { target: '1', n: 1, source: '0' } },
        { key: 'log.dying', params: { target: '1' } },
      ],
    }),
  },
  {
    label: '3 · nobody plays a 桃  → you die, and your role is revealed',
    state: step({
      hp: [4, 0, 3, 3],
      alive: [true, false, true, true],
      revealed: [true, true, false, false],
      hands: [4, 0, 4, 4],
      viewerHand: [],
      discardPile: [STRIKE, ...HAND_BEFORE],
      pending: { kind: 'act', waitingOn: '0' },
      turnPhase: 'action',
      activeSeat: 0,
      strikesPlayed: 1,
      log: [
        ...log0,
        { key: 'log.plays_at', params: { player: '0', card: STRIKE, target: '1' } },
        { key: 'log.declines', params: { player: '1' } },
        { key: 'log.damage', params: { target: '1', n: 1, source: '0' } },
        { key: 'log.dying', params: { target: '1' } },
        { key: 'log.declines', params: { player: '2' } },
        { key: 'log.death', params: { target: '1', role: 'loyalist' } },
      ],
    }),
  },
  {
    label: '4 · seat 3’s turn begins (you watch as a corpse — hand gone, role shown)',
    state: step({
      hp: [4, 0, 3, 3],
      alive: [true, false, true, true],
      revealed: [true, true, false, false],
      hands: [4, 0, 6, 4],
      viewerHand: [],
      discardPile: [STRIKE, ...HAND_BEFORE],
      pending: { kind: 'act', waitingOn: '2' },
      turnPhase: 'action',
      activeSeat: 2,
      log: [
        { key: 'log.death', params: { target: '1', role: 'loyalist' } },
        { key: 'log.turn_start', params: { player: '2' } },
        { key: 'log.draws', params: { player: '2', n: 2 } },
      ],
    }),
  },
];

/** The same script, but the viewer holds a 桃 and a 闪 — the survivable branch,
 * so the harness can show a heal (green flash) as well as a death. */
export const SCENARIO_SURVIVES: { label: string; state: TableState }[] = [
  SCENARIO_STEPS[0],
  {
    label: '1 · 杀 played at you (you hold a 闪 and a 桃)',
    state: step({
      hp: [4, 1, 3, 3],
      hands: [4, 3, 4, 4],
      viewerHand: [DODGE, PEACH, id('strike', 1)],
      discardPile: [STRIKE],
      pending: {
        kind: 'demandCard',
        playerId: VIEWER,
        demandKind: 'dodge',
        count: 1,
        reasonKey: 'demand.dodge',
        subject: '0',
      },
      turnPhase: 'action',
      activeSeat: 0,
      strikesPlayed: 1,
      log: [...log0, { key: 'log.plays_at', params: { player: '0', card: STRIKE, target: '1' } }],
    }),
  },
  {
    label: '2 · you play the 闪  → no damage; the 杀 fizzles',
    state: step({
      hp: [4, 1, 3, 3],
      hands: [4, 2, 4, 4],
      viewerHand: [PEACH, id('strike', 1)],
      discardPile: [STRIKE, DODGE],
      pending: { kind: 'act', waitingOn: '0' },
      turnPhase: 'action',
      activeSeat: 0,
      strikesPlayed: 1,
      log: [
        ...log0,
        { key: 'log.plays_at', params: { player: '0', card: STRIKE, target: '1' } },
        { key: 'log.responds', params: { player: '1', card: DODGE } },
      ],
    }),
  },
  {
    label: '3 · your turn: you play the 桃  → +1 hp (the heal flash)',
    state: step({
      hp: [4, 2, 3, 3],
      hands: [4, 1, 4, 4],
      viewerHand: [id('strike', 1)],
      discardPile: [STRIKE, DODGE, PEACH],
      pending: { kind: 'act', playerId: VIEWER },
      turnPhase: 'action',
      activeSeat: 1,
      log: [
        { key: 'log.turn_start', params: { player: '1' } },
        { key: 'log.draws', params: { player: '1', n: 2 } },
        { key: 'log.plays', params: { player: '1', card: PEACH } },
        { key: 'log.heal', params: { target: '1', n: 1 } },
      ],
    }),
  },
];
