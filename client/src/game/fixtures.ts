// Hand-built TableStates for developing and eyeballing the board without a
// running server (task 6.1 is presentational; live wiring is 6.2 / Phase 5).
//
// These are *view* states — the shape playerView() emits, from one named
// viewer's perspective — not engine GStates. That distinction is the point:
// every fixture below is only ever allowed to contain what that viewer is
// legally permitted to see (own hand, other seats as counts, roles only where
// revealed), so if a component starts wanting data that isn't here, that's the
// design catching a leak rather than a missing prop.
//
// Card ids are looked up from the real content JSON rather than typed by hand,
// so a fixture can't drift out of sync with cards.json.

import { cards, generals } from '@3k/shared';
import type { AnyPlayerView, EquipmentView, Role, TableState } from './viewTypes.js';

/** N distinct real card ids for a given effect key, e.g. 3 different 杀. */
function pick(effectKey: string, n = 1): string[] {
  const ids = cards.filter((c) => c.effectKey === effectKey).map((c) => c.id);
  if (ids.length < n) throw new Error(`fixtures: only ${ids.length} cards for ${effectKey}`);
  return ids.slice(0, n);
}

function one(effectKey: string): string {
  return pick(effectKey, 1)[0];
}

const NO_EQUIPMENT: EquipmentView = {
  weapon: null,
  armour: null,
  plusHorse: null,
  minusHorse: null,
};

interface SeatSpec {
  role: Role;
  roleRevealed?: boolean;
  hp?: number;
  alive?: boolean;
  hand?: string[];
  handCount?: number;
  equipment?: Partial<EquipmentView>;
  judgementZone?: string[];
}

/** Builds the players map + seat order. The viewer (seat index `viewerSeat`)
 * gets a real `hand`; everyone else gets a `handCount`, exactly as playerView
 * would strip them. */
function buildSeats(specs: SeatSpec[], viewerSeat: number) {
  const seats = specs.map((_, i) => String(i));
  const players: Record<string, AnyPlayerView> = {};

  specs.forEach((spec, i) => {
    const general = generals[i];
    const isLord = spec.role === 'lord';
    const maxHp = general.maxHp + (isLord ? 1 : 0);
    const base = {
      id: String(i),
      seat: i,
      roleRevealed: spec.roleRevealed ?? isLord,
      generalId: general.id,
      maxHp,
      hp: spec.hp ?? maxHp,
      alive: spec.alive ?? true,
      equipment: { ...NO_EQUIPMENT, ...spec.equipment },
      judgementZone: spec.judgementZone ?? [],
      flags: {},
    };

    players[String(i)] =
      i === viewerSeat
        ? { ...base, role: spec.role, hand: spec.hand ?? [] }
        : {
            ...base,
            handCount: spec.handCount ?? 4,
            ...(base.roleRevealed ? { role: spec.role } : {}),
          };
  });

  return { seats, players };
}

interface FixtureSpec {
  specs: SeatSpec[];
  viewerSeat: number;
  activeSeat: number;
  turnPhase: TableState['turnPhase'];
  pending: TableState['pending'];
  discardPile?: string[];
  drawPileCount?: number;
  gameOver?: TableState['gameOver'];
  /** Sample entries for the 6.2 log renderer. The engine writes nothing to
   * G.log yet (Phase 2 review, finding F3) — these are what it *will* write, in
   * the vocabulary log.ts defines. */
  log?: TableState['log'];
  turnFlags?: Partial<TableState['turnFlags']>;
}

function build({
  specs,
  viewerSeat,
  activeSeat,
  turnPhase,
  pending,
  discardPile = [],
  drawPileCount = 60,
  gameOver,
  log = [],
  turnFlags,
}: FixtureSpec): TableState {
  const { seats, players } = buildSeats(specs, viewerSeat);
  return {
    drawPileCount,
    discardPile,
    players,
    seats,
    activeSeat,
    turnPhase,
    skipPhases: [],
    turnFlags: { strikesPlayed: 0, strikeLimit: 1, ...turnFlags },
    pending,
    log,
    ...(gameOver ? { gameOver } : {}),
  };
}

export interface Fixture {
  /** Dev-harness id — not user-facing copy, so deliberately not an i18n key. */
  id: string;
  viewerId: string;
  state: TableState;
}

/** 4 players, opening hands, the lord is about to act. */
const fourOpening = build({
  viewerSeat: 0,
  activeSeat: 0,
  turnPhase: 'action',
  pending: { kind: 'act', playerId: '0' },
  specs: [
    { role: 'lord', hand: [...pick('strike', 2), one('dodge'), one('peach')] },
    { role: 'loyalist' },
    { role: 'rebel' },
    { role: 'traitor' },
  ],
});

/** 8 players, mid-game: equipment on the table, a delayed trick parked in a
 * judgement zone, one seat already dead (role revealed), and the engine blocked
 * on someone who is NOT the turn owner — a 杀 asking its target for a 闪. */
const eightMidgame = build({
  viewerSeat: 2,
  activeSeat: 0,
  turnPhase: 'action',
  pending: {
    kind: 'demandCard',
    playerId: '2',
    demandKind: 'dodge',
    count: 1,
    reasonKey: 'demand.dodge',
    subject: '0',
  },
  drawPileCount: 31,
  discardPile: [one('strike'), one('draw_two'), pick('strike', 3)[2]],
  turnFlags: { strikesPlayed: 1 },
  log: [
    { key: 'log.turn_start', params: { player: '0' } },
    { key: 'log.phase', params: { player: '0', phase: 'draw' } },
    { key: 'log.draws', params: { player: '0', n: 2 } },
    { key: 'log.plays_at', params: { player: '0', card: one('strike'), target: '2' } },
  ],
  specs: [
    {
      role: 'lord',
      hp: 3,
      handCount: 6,
      equipment: { weapon: one('zhuge_crossbow'), plusHorse: one('plus_horse') },
    },
    { role: 'loyalist', hp: 2, handCount: 1 },
    {
      role: 'rebel',
      hp: 2,
      hand: [...pick('dodge', 2), one('strike'), one('nullification'), one('harvest')],
      equipment: { armour: one('eight_trigrams'), minusHorse: one('minus_horse') },
      judgementZone: [one('indulgence'), one('lightning')],
    },
    { role: 'rebel', handCount: 3, equipment: { weapon: pick('green_dragon_blade', 1)[0] } },
    { role: 'loyalist', hp: 1, handCount: 2 },
    { role: 'rebel', hp: 0, alive: false, roleRevealed: true, handCount: 0 },
    { role: 'traitor', hp: 2, handCount: 5 },
    { role: 'rebel', hp: 3, handCount: 4 },
  ],
});

/** An open dying window: the viewer is at 0 hp, still alive, and is the one
 * being asked for a 桃 (engine-design §5). The seat must read as 濒死, not dead. */
const dyingWindow = build({
  viewerSeat: 1,
  activeSeat: 3,
  turnPhase: 'action',
  pending: {
    kind: 'demandCard',
    playerId: '1',
    demandKind: 'peach',
    count: 1,
    reasonKey: 'demand.peach',
    subject: '1',
  },
  drawPileCount: 44,
  discardPile: pick('strike', 2),
  specs: [
    { role: 'lord', hp: 4, handCount: 5 },
    { role: 'loyalist', hp: 0, hand: [one('dodge')], equipment: { armour: one('renwang_shield') } },
    { role: 'rebel', hp: 3, handCount: 2 },
    { role: 'rebel', hp: 4, handCount: 4, equipment: { weapon: one('frost_blade') } },
  ],
});

/** Game over: rebels dead, roles revealed, no pending request. */
const endgame = build({
  viewerSeat: 0,
  activeSeat: 0,
  turnPhase: 'end',
  pending: null,
  drawPileCount: 8,
  discardPile: [...pick('strike', 4), one('peach')],
  gameOver: { winners: ['0', '1'], condition: 'lord' },
  specs: [
    { role: 'lord', hp: 1, hand: [one('peach')] },
    { role: 'loyalist', hp: 2, roleRevealed: true, handCount: 3 },
    { role: 'rebel', hp: 0, alive: false, roleRevealed: true, handCount: 0 },
    { role: 'traitor', hp: 0, alive: false, roleRevealed: true, handCount: 0 },
  ],
});

/** Discard phase: the hand limit is your current HP, so a 3-hp lord holding 6
 * cards owes exactly 3. The prompt has no decline path — the engine will not
 * move on until the cards are chosen. */
const discardPhase = build({
  viewerSeat: 0,
  activeSeat: 0,
  turnPhase: 'discard',
  pending: { kind: 'discard', playerId: '0', count: 3 },
  drawPileCount: 22,
  discardPile: pick('strike', 2),
  log: [
    { key: 'log.turn_start', params: { player: '0' } },
    { key: 'log.plays_at', params: { player: '0', card: one('strike'), target: '2' } },
    { key: 'log.responds', params: { player: '2', card: one('dodge') } },
    { key: 'log.phase', params: { player: '0', phase: 'discard' } },
  ],
  specs: [
    {
      role: 'lord',
      hp: 3,
      hand: [...pick('strike', 2), ...pick('dodge', 2), one('peach'), one('duel')],
    },
    { role: 'loyalist', handCount: 4 },
    { role: 'rebel', hp: 3, handCount: 5 },
    { role: 'traitor', handCount: 3 },
  ],
});

/** An open 过河拆桥 card-pick (3.3's chooseCard — the second request kind the
 * board was blind to). The viewer PLAYED the card and is being asked which of
 * seat 3's cards to destroy: a hand slot (face down, addressed by position), a
 * piece of equipment, or the delayed trick parked in their judgement zone. Note
 * the viewer's own hand is inert here — this is the one request that is not
 * answered with a card of your own. */
const chooseCardWindow = build({
  viewerSeat: 0,
  activeSeat: 0,
  turnPhase: 'action',
  pending: {
    kind: 'chooseCard',
    playerId: '0',
    target: '3',
    reasonKey: 'choose.dismantle',
    choices: [
      { z: 'hand', index: 0 },
      { z: 'hand', index: 1 },
      { z: 'hand', index: 2 },
      { z: 'equip', cardId: one('frost_blade') },
      { z: 'judgementZone', cardId: one('indulgence') },
    ],
  },
  drawPileCount: 35,
  discardPile: [one('dismantle')],
  log: [
    { key: 'log.turn_start', params: { player: '0' } },
    { key: 'log.plays_at', params: { player: '0', card: one('dismantle'), target: '3' } },
  ],
  specs: [
    { role: 'lord', hp: 4, hand: [...pick('strike', 2), one('peach')] },
    { role: 'loyalist', handCount: 2 },
    { role: 'rebel', handCount: 5 },
    {
      role: 'rebel',
      hp: 3,
      handCount: 3,
      equipment: { weapon: one('frost_blade') },
      judgementZone: [one('indulgence')],
    },
  ],
});

export const FIXTURES: Fixture[] = [
  { id: '4p · opening', viewerId: '0', state: fourOpening },
  { id: '8p · midgame', viewerId: '2', state: eightMidgame },
  { id: '4p · dying window', viewerId: '1', state: dyingWindow },
  { id: '4p · discard', viewerId: '0', state: discardPhase },
  { id: '4p · 过河拆桥 card-pick', viewerId: '0', state: chooseCardWindow },
  { id: '4p · game over', viewerId: '0', state: endgame },
];
