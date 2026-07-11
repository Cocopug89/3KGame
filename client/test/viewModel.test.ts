// Unit tests for the table's pure view-model (task 6.1). The board itself is
// deliberately dumb — every decision it makes (who sits where, what's hidden,
// who we're waiting on, dying vs. dead) is a function in viewModel.ts, so it can
// be tested here without a renderer or a DOM.

import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../src/game/fixtures';
import {
  EQUIPMENT_SLOTS,
  PHASE_I18N_KEY,
  discardTop,
  equipmentSlots,
  handSize,
  isDying,
  ringPositions,
  roleI18nKey,
  seatsForViewer,
  statusView,
  turnOwnerId,
} from '../src/game/viewModel';
import { cardById } from '../src/game/cardIndex';
import { isSelfView, pendingPlayerId, type TableState } from '../src/game/viewTypes';
import en from '../../locales/en.json';
import zh from '../../locales/zh.json';

const fixture = (id: string): { state: TableState; viewerId: string } => {
  const f = FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`no fixture ${id}`);
  return { state: f.state, viewerId: f.viewerId };
};

describe('fixtures', () => {
  it('only ever reference real cards and generals', () => {
    for (const f of FIXTURES) {
      for (const player of Object.values(f.state.players)) {
        const ids = [
          ...(isSelfView(player) ? player.hand : []),
          ...player.judgementZone,
          ...Object.values(player.equipment).filter((c): c is string => c != null),
        ];
        for (const id of ids) expect(cardById(id), `unknown card ${id}`).toBeDefined();
      }
      for (const id of f.state.discardPile) expect(cardById(id), `unknown card ${id}`).toBeDefined();
    }
  });

  // The whole board is written against the *stripped* playerView; a fixture that
  // handed a second player a real hand would let a leak pass unnoticed here.
  it('expose exactly one visible hand — the viewer’s', () => {
    for (const f of FIXTURES) {
      const withHands = Object.values(f.state.players).filter(isSelfView);
      expect(withHands.map((p) => p.id)).toEqual([f.viewerId]);
    }
  });

  it('never reveal an unrevealed role', () => {
    for (const f of FIXTURES) {
      for (const [id, player] of Object.entries(f.state.players)) {
        if (id === f.viewerId || player.roleRevealed) continue;
        expect('role' in player, `role leaked for seat ${id}`).toBe(false);
      }
    }
  });
});

describe('seatsForViewer', () => {
  it('puts the viewer first and the rest in seat order from there', () => {
    const { state } = fixture('8p · midgame');
    const { self, others } = seatsForViewer(state, '2');
    expect(self?.playerId).toBe('2');
    expect(others.map((s) => s.playerId)).toEqual(['3', '4', '5', '6', '7', '0', '1']);
    expect(others.every((s) => !s.isViewer)).toBe(true);
  });

  it('marks the turn owner and the seat the engine is blocked on separately', () => {
    // Mid-杀: seat 0 owns the turn, but seat 2 is the one being asked for a 闪.
    const { state } = fixture('8p · midgame');
    const { self, others } = seatsForViewer(state, '2');
    expect(turnOwnerId(state)).toBe('0');
    expect(self?.isWaitingOn).toBe(true);
    expect(self?.isTurnOwner).toBe(false);
    expect(others.find((s) => s.playerId === '0')?.isTurnOwner).toBe(true);
    expect(others.filter((s) => s.isWaitingOn)).toHaveLength(0);
  });

  it('gives a spectator every seat and no self seat', () => {
    const { state } = fixture('4p · opening');
    const { self, others } = seatsForViewer(state, null);
    expect(self).toBeNull();
    expect(others.map((s) => s.playerId)).toEqual(['0', '1', '2', '3']);
  });

  it('treats an unseated viewer id as a spectator rather than throwing', () => {
    const { state } = fixture('4p · opening');
    expect(seatsForViewer(state, 'nobody').self).toBeNull();
  });
});

describe('ringPositions', () => {
  it('puts a lone opponent at the top, opposite the viewer', () => {
    const [p] = ringPositions(1);
    expect(p.leftPct).toBeCloseTo(50, 5);
    expect(p.topPct).toBeLessThan(50);
  });

  it('sweeps seat order clockwise: first opponent left, last opponent right', () => {
    const ps = ringPositions(3);
    expect(ps).toHaveLength(3);
    expect(ps[0].leftPct).toBeLessThan(50); // lower-left
    expect(ps[1].leftPct).toBeCloseTo(50, 5); // top
    expect(ps[2].leftPct).toBeGreaterThan(50); // lower-right
    expect(ps[1].topPct).toBeLessThan(ps[0].topPct); // top seat is highest
  });

  it('is symmetric and stays inside the table for every legal player count', () => {
    for (const others of [3, 4, 5, 6, 7]) {
      const ps = ringPositions(others);
      expect(ps).toHaveLength(others);
      for (const p of ps) {
        expect(p.leftPct).toBeGreaterThanOrEqual(0);
        expect(p.leftPct).toBeLessThanOrEqual(100);
        expect(p.topPct).toBeGreaterThanOrEqual(0);
        expect(p.topPct).toBeLessThanOrEqual(100);
      }
      const first = ps[0];
      const last = ps[ps.length - 1];
      expect(first.leftPct + last.leftPct).toBeCloseTo(100, 5);
      expect(first.topPct).toBeCloseTo(last.topPct, 5);
    }
  });

  it('never places an opponent on the viewer’s own edge', () => {
    for (const others of [1, 3, 5, 7]) {
      for (const p of ringPositions(others)) expect(p.topPct).toBeLessThan(70);
    }
  });
});

describe('hand and role visibility', () => {
  it('counts hands for both view variants', () => {
    const { state } = fixture('8p · midgame');
    expect(handSize(state.players['2'])).toBe(5); // viewer: real cards
    expect(handSize(state.players['0'])).toBe(6); // everyone else: a count
  });

  it('shows the viewer their own role, hides unrevealed roles, shows revealed ones', () => {
    const { state } = fixture('8p · midgame');
    expect(roleI18nKey(state.players['2'], true)).toBe('role.rebel');
    expect(roleI18nKey(state.players['0'], false)).toBe('role.lord'); // lord: revealed from setup
    expect(roleI18nKey(state.players['5'], false)).toBe('role.rebel'); // dead: revealed on death
    expect(roleI18nKey(state.players['1'], false)).toBeNull(); // alive, unrevealed
  });
});

describe('dying vs dead', () => {
  it('reads hp ≤ 0 with the window still open as dying, not dead', () => {
    const { state } = fixture('4p · dying window');
    const dying = state.players['1'];
    expect(dying.alive).toBe(true);
    expect(dying.hp).toBe(0);
    expect(isDying(dying)).toBe(true);
  });

  it('does not call a dead player dying', () => {
    const { state } = fixture('8p · midgame');
    const dead = state.players['5'];
    expect(dead.alive).toBe(false);
    expect(isDying(dead)).toBe(false);
  });
});

describe('equipment', () => {
  it('always renders four slots in a fixed order, empty ones included', () => {
    const { state } = fixture('4p · opening');
    const slots = equipmentSlots(state.players['0']);
    expect(slots.map((s) => s.slot)).toEqual([...EQUIPMENT_SLOTS]);
    expect(slots.every((s) => s.cardId === null)).toBe(true);
    expect(slots.map((s) => s.labelKey)).toEqual([
      'equipment_type.weapon',
      'equipment_type.armour',
      'ui.plus_horse',
      'ui.minus_horse',
    ]);
  });

  it('fills the slots a player actually has equipped', () => {
    const { state } = fixture('8p · midgame');
    const slots = equipmentSlots(state.players['2']);
    const filled = Object.fromEntries(slots.filter((s) => s.cardId).map((s) => [s.slot, true]));
    expect(filled).toEqual({ armour: true, minusHorse: true });
  });
});

describe('status line', () => {
  it('separates whose turn it is from who is being asked', () => {
    const { state } = fixture('8p · midgame');
    const status = statusView(state, '2');
    expect(status.phaseKey).toBe('phase.action');
    expect(status.turnOwnerId).toBe('0');
    expect(status.isViewerTurn).toBe(false);
    expect(status.waitingOnId).toBe('2');
    expect(status.isViewerWaitedOn).toBe(true);
    expect(status.pendingKind).toBe('demandCard');
  });

  it('reads the pending player out of either view variant', () => {
    expect(pendingPlayerId({ kind: 'act', playerId: '0' })).toBe('0');
    expect(pendingPlayerId({ kind: 'demandCard', waitingOn: '3' })).toBe('3');
    expect(pendingPlayerId(null)).toBeNull();
  });

  it('has no pending request once the game is over', () => {
    const { state } = fixture('4p · game over');
    const status = statusView(state, '0');
    expect(status.waitingOnId).toBeNull();
    expect(status.pendingKind).toBeNull();
    expect(state.gameOver?.winners).toEqual(['0', '1']);
  });

  it('maps every engine phase to a locale key that exists', () => {
    expect(Object.keys(PHASE_I18N_KEY)).toEqual([
      'prep',
      'judge',
      'draw',
      'action',
      'discard',
      'end',
    ]);
  });
});

describe('discard pile', () => {
  it('shows the most recently discarded card on top', () => {
    const { state } = fixture('8p · midgame');
    expect(discardTop(state)).toBe(state.discardPile[state.discardPile.length - 1]);
  });

  it('has no top card when nothing has been discarded', () => {
    const { state } = fixture('4p · opening');
    expect(state.discardPile).toHaveLength(0);
    expect(discardTop(state)).toBeNull();
  });
});

// A missing key renders as the raw key string ("ui.dying") rather than throwing,
// so nothing else would catch this — and the table is where the i18n rule
// ("every user-facing string is a key") is easiest to break silently.
describe('locale coverage for the table', () => {
  const KEYS_USED_BY_THE_TABLE = [
    ...Object.values(PHASE_I18N_KEY),
    'equipment_type.weapon',
    'equipment_type.armour',
    'ui.plus_horse',
    'ui.minus_horse',
    'ui.hand',
    'ui.cards_count',
    'ui.seat',
    'ui.you',
    'ui.role_unknown',
    'ui.judgement_zone',
    'ui.dying',
    'ui.dead',
    'ui.waiting',
    'ui.waiting_on',
    'ui.your_turn',
    'ui.player_turn',
    'ui.draw_pile',
    'ui.discard_pile',
    'ui.game_over',
    'ui.winners',
    'role.lord',
    'role.loyalist',
    'role.rebel',
    'role.traitor',
    'kingdom.wei',
    'kingdom.shu',
    'kingdom.wu',
    'kingdom.qun',
  ];

  it('has every key the table renders, in both languages', () => {
    for (const key of KEYS_USED_BY_THE_TABLE) {
      expect(en, `en is missing ${key}`).toHaveProperty([key]);
      expect(zh, `zh is missing ${key}`).toHaveProperty([key]);
    }
  });

  // i18next's default interpolation is {{var}}; a single-braced {var} is emitted
  // verbatim. (Note the placeholder is {{n}}, not {{count}} — passing `count`
  // switches i18next into plural resolution, which would need _one/_other key
  // variants that the zh/en key-parity test forbids.)
  it('uses double-brace placeholders in every interpolated string', () => {
    for (const dict of [en, zh] as Record<string, string>[]) {
      for (const [key, value] of Object.entries(dict)) {
        const singles = value.replace(/\{\{[^}]+\}\}/g, '').match(/\{[^}]+\}/g);
        expect(singles, `${key} has a single-braced placeholder: ${value}`).toBeNull();
      }
    }
  });
});
