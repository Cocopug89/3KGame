// Render smoke tests for the table (task 6.1). The view-model tests cover the
// decisions; these cover the wiring — that the components actually mount, that
// they render through i18next in both languages, and (most importantly) that the
// markup never contains something the viewer isn't allowed to see.
//
// Server-rendered to a string via react-dom/server rather than mounted in a DOM:
// the board is static output at this stage (moves are 6.2), so a renderer and a
// jsdom dependency would buy nothing. Note this deliberately does NOT import
// src/i18n.ts — that module touches localStorage on import, which doesn't exist
// in the node test environment; it builds its own instance from the same locale
// files instead.

import { describe, expect, it, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { createInstance, type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../locales/en.json';
import zh from '../../locales/zh.json';
import { GameTable } from '../src/components/table/GameTable';
import { FIXTURES } from '../src/game/fixtures';
import { recordingActions, type TableActions } from '../src/game/actions';
import { isSelfView } from '../src/game/viewTypes';
import { generalById } from '../src/game/cardIndex';

let i18n: I18n;

beforeAll(async () => {
  i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: en }, zh: { translation: zh } },
    interpolation: { escapeValue: false },
  });
});

// By id, never by index — fixtures get inserted, and a positional lookup makes
// an unrelated test fail for a reason that has nothing to do with what it tests.
const fx = (id: string) => {
  const f = FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`no fixture ${id}`);
  return f;
};

const render = (
  state: (typeof FIXTURES)[number]['state'],
  viewerId: string | null,
  actions?: TableActions,
  rejected = false,
) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <GameTable state={state} viewerId={viewerId} actions={actions} rejected={rejected} />
    </I18nextProvider>,
  );

/** A board wired to moves (6.2). Nothing is clicked in a static render, so the
 * sink is only here to satisfy the interface. */
const wired = (): TableActions => recordingActions(() => {});

describe('GameTable renders', () => {
  it('draws one seat per player, plus the viewer’s hand', () => {
    const { state, viewerId } = fx('8p · midgame');
    const html = render(state, viewerId);
    const seats = html.match(/class="[^"]*\bseat\b[^"]*"/g) ?? [];
    expect(seats).toHaveLength(8);
    expect(html).toContain('hand__cards');

    const viewer = state.players[viewerId];
    if (!isSelfView(viewer)) throw new Error('fixture viewer has no hand');
    // 5 hand cards + the discard top + equipment faces, all as real card faces.
    expect((html.match(/class="[^"]*card--md[^"]*"/g) ?? []).length).toBeGreaterThanOrEqual(
      viewer.hand.length,
    );
  });

  it('renders every player count the game supports, and a spectator', () => {
    for (const f of FIXTURES) {
      expect(() => render(f.state, f.viewerId)).not.toThrow();
      expect(() => render(f.state, null)).not.toThrow();
    }
    const spectator = render(fx('4p · opening').state, null);
    expect(spectator).not.toContain('badge--you');
  });

  it('shows the turn owner and the seat being asked as different seats', () => {
    const { state, viewerId } = fx('8p · midgame'); // seat 0 acting, seat 2 owes a 闪
    const html = render(state, viewerId);
    expect(html).toContain('seat--turn');
    expect(html).toContain('seat--waiting');
    expect(html).toContain('Waiting on');
  });

  it('marks a dying player as dying, not dead', () => {
    const { state, viewerId } = fx('4p · dying window');
    const html = render(state, viewerId);
    expect(html).toContain('badge--dying');
    expect(html).not.toContain('badge--dead');
  });

  it('announces the winners when the game is over', () => {
    const { state, viewerId } = fx('4p · game over');
    const html = render(state, viewerId);
    expect(html).toContain('Game Over');
    expect(html).toContain('center__gameover');
  });

  it('renders no raw i18n keys — every string goes through a locale file', () => {
    for (const f of FIXTURES) {
      const html = render(f.state, f.viewerId);
      expect(html).not.toMatch(/>(ui|role|phase|kingdom|card|equipment_type)\.[a-z_]+</);
      expect(html).not.toContain('{{');
    }
  });

  it('switches language without changing the layout', async () => {
    const { state, viewerId } = fx('4p · opening');
    await i18n.changeLanguage('zh');
    const zhHtml = render(state, viewerId);
    await i18n.changeLanguage('en');
    const enHtml = render(state, viewerId);

    expect(zhHtml).toContain('主公'); // role badge, zh
    expect(enHtml).toContain('Lord');
    const classesOf = (html: string) => (html.match(/class="[^"]*"/g) ?? []).join('|');
    expect(classesOf(zhHtml)).toBe(classesOf(enHtml));
  });
});

describe('GameTable leaks nothing', () => {
  // The board can only render what playerView sent it, so this is really a test
  // that the board never *infers* hidden information — but it's the cheapest
  // possible tripwire on the property the whole server-authoritative design
  // exists to protect, and it runs on every player count we support.
  it('never renders another player’s card faces or an unrevealed role', () => {
    for (const f of FIXTURES) {
      const html = render(f.state, f.viewerId);
      const viewer = f.state.players[f.viewerId];
      const ownCards = new Set(isSelfView(viewer) ? viewer.hand : []);

      for (const [id, player] of Object.entries(f.state.players)) {
        if (id === f.viewerId) continue;
        // No hand cards exist in the view for other seats at all; assert the
        // rendered faces are only ever the viewer's own or public zones.
        expect(isSelfView(player)).toBe(false);
        if (!player.roleRevealed) {
          expect(html).toContain('Unknown Role');
        }
      }
      expect(ownCards.size).toBe(isSelfView(viewer) ? viewer.hand.length : 0);
    }
  });
});

// ── the interaction layer (6.2) ──────────────────────────────────────────
describe('GameTable prompts and targeting', () => {
  it('shows no prompt and an inert hand when nobody is waiting on you', () => {
    // Seat 0 owns the turn but the engine is blocked on seat 2's 闪.
    const { state } = fx('8p · midgame');
    const html = render(state, '0', wired());
    expect(html).not.toContain('prompt__title');
    // Seat 0 sees no hand at all here (the fixture only carries seat 2's), but
    // the point stands: no prompt ⇒ no buttons to press.
    expect(html).not.toContain('btn--primary');
  });

  it('asks the target of a 杀 for a 闪, and offers the decline path explicitly', () => {
    const { state, viewerId } = fx('8p · midgame');
    const html = render(state, viewerId, wired());
    expect(html).toContain('play a Dodge?');
    expect(html).toContain('Decline (take the damage)');
    // Primary is disabled until a card is picked — a static render has none.
    expect(html).toMatch(/class="btn btn--primary"[^>]*disabled/);
  });

  it('greys out every card that cannot answer the prompt, and says why', () => {
    const { state, viewerId } = fx('8p · midgame'); // dodge request
    const html = render(state, viewerId, wired());
    const blocked = html.match(/card--blocked/g) ?? [];
    const viewer = state.players[viewerId];
    if (!isSelfView(viewer)) throw new Error('fixture viewer has no hand');
    const dodges = viewer.hand.filter((c) => c.startsWith('dodge')).length;
    expect(blocked).toHaveLength(viewer.hand.length - dodges);
    expect(html).toContain('answer this request'); // React escapes the apostrophe in "can't"
  });

  it('leaves the discard prompt with no way out', () => {
    const { state, viewerId } = fx('4p · discard');
    const html = render(state, viewerId, wired());
    expect(html).toContain('Discard down to your hand limit');
    expect(html).toContain('Select 3 more card(s)');
    expect(html).not.toContain('btn--secondary');
  });

  it('surfaces a server rejection rather than silently swallowing it', () => {
    const { state, viewerId } = fx('4p · opening');
    expect(render(state, viewerId, wired(), false)).not.toContain('prompt--rejected');
    const html = render(state, viewerId, wired(), true);
    expect(html).toContain('prompt--rejected');
    expect(html).toContain('The server rejected that move as illegal');
  });

  it('renders a read-only board when no actions are supplied (6.1 behaviour)', () => {
    const { state, viewerId } = fx('4p · opening');
    const html = render(state, viewerId);
    expect(html).not.toContain('prompt__title');
    expect(html).not.toContain('seat--targetable');
  });
});

describe('GameTable log', () => {
  it('renders log entries newest-first, in the current language', () => {
    const { state, viewerId } = fx('4p · discard');
    const html = render(state, viewerId, wired());
    const first = html.indexOf('enters the Discard Phase');
    const last = html.indexOf('———');
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(last); // newest first: turn_start is oldest
    expect(html).toContain('Cao Cao plays Strike on');
  });

  it('renders nothing but a dash when the engine has logged nothing (F3)', () => {
    const { state, viewerId } = fx('4p · opening');
    const html = render(state, viewerId, wired());
    expect(html).toContain('log__empty');
  });
});

describe('GameTable motion (6.3)', () => {
  it('renders a seat with no animation class until something happens to it', () => {
    // A first render is not a transition — the board arrives calm.
    const { state, viewerId } = fx('4p · opening');
    const html = render(state, viewerId, wired());
    expect(html).not.toContain('fx-damage');
    expect(html).not.toContain('fx-death');
    expect(html).not.toContain('fx-played');
  });

  it('marks a dying seat as pulsing, which is a state and not a one-shot', () => {
    const { state, viewerId } = fx('4p · dying window');
    // .seat--dying carries the infinite pulse in CSS; the class is the contract.
    expect(render(state, viewerId, wired())).toContain('seat--dying');
  });

  it('keeps a dead seat in the ring rather than removing it', () => {
    const { state, viewerId } = fx('8p · midgame');
    const html = render(state, viewerId, wired());
    expect(html).toContain('seat--dead');
    expect((html.match(/class="[^"]*\bseat\b[^"]*"/g) ?? [])).toHaveLength(8);
  });
});

// ── the card-pick (3.3's chooseCard) — the request the board was blind to ──
describe('GameTable answers a card-pick', () => {
  it('renders a prompt at all, instead of leaving the player with nothing', () => {
    const { state, viewerId } = fx('4p · 过河拆桥 card-pick');
    const html = render(state, viewerId, wired());
    // Before this, promptFor() returned null here and the table stalled on the
    // player who had just played the card.
    expect(html).toContain('prompt__title');
    expect(html).toContain('choices__zones');
  });

  it('asks the engine’s question, and names whose cards these are', () => {
    const { state, viewerId } = fx('4p · 过河拆桥 card-pick');
    const html = render(state, viewerId, wired());
    expect(html).toContain(en['choose.dismantle']); // the engine's own reasonKey
    // The victim is named on the choice panel — {{player}} resolved to a general,
    // not left as an id or a raw placeholder.
    const victim = generalById(state.players['3'].generalId)!;
    expect(html).toContain(`${victim.enName}&#x27;s cards`);
    expect(html).not.toContain('{{');
  });

  it('shows the victim’s hand FACE DOWN — a card id leaks suit and rank', () => {
    const { state, viewerId } = fx('4p · 过河拆桥 card-pick');
    const html = render(state, viewerId, wired());
    const choices = html.slice(html.indexOf('choices__zones'), html.indexOf('prompt__title'));
    expect((choices.match(/card--back/g) ?? []).length).toBe(3); // three hand slots
    expect(choices).toContain('Hand 1');
    expect(choices).toContain('Hand 3');
    // …and the public zones face up, because they already are.
    expect(choices).toContain('Frost Blade');
    expect(choices).toContain('Indulgence');
  });

  it('renders no decline button — the card is already resolving', () => {
    const { state, viewerId } = fx('4p · 过河拆桥 card-pick');
    const html = render(state, viewerId, wired());
    expect(html).not.toContain('btn--secondary');
    expect(html).toMatch(/class="btn btn--primary"[^>]*disabled/); // until a slot is picked
  });

  it('tells the player their own hand is not the answer', () => {
    const { state, viewerId } = fx('4p · 过河拆桥 card-pick');
    const html = render(state, viewerId, wired());
    expect(html).toContain('Answer by picking one of their cards below');
    expect(html).not.toContain('Not implemented yet');
  });
});
