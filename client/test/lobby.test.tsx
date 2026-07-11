// Task 5.1 — the lobby's client side. Two things worth a test here: the one
// piece of real logic (reconciling boardgame.io's bare `host:port` server
// convention with `fetch`'s need for an absolute URL), and that the lobby
// screen renders through i18next in both languages without leaking a raw key.
//
// Same approach as renderTable.test.tsx: rendered to a string via
// react-dom/server, and deliberately NOT importing src/i18n.ts (it touches
// localStorage on import, which the node test environment doesn't have).

import { describe, expect, it, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { createInstance, type i18n as I18n } from 'i18next';
import en from '../../locales/en.json';
import zh from '../../locales/zh.json';
import { generals, THREE_KINGDOMS_STAGE_MOVES } from '@3k/shared';
import { toHttpUrl } from '../src/lobby/serverUrl';
import { LobbyPage } from '../src/lobby/LobbyPage';
import { GeneralSelect } from '../src/lobby/GeneralSelect';
import { ThreeKingdomsClientGame } from '../src/lobby/clientGame';
import type { SelectionView } from '../src/game/viewTypes';

describe('toHttpUrl', () => {
  it('gives a bare host:port the protocol fetch() needs', () => {
    expect(toHttpUrl('localhost:3000')).toBe('http://localhost:3000');
  });

  it('leaves an explicit protocol alone — including https in production', () => {
    expect(toHttpUrl('https://3k-game-server.onrender.com')).toBe(
      'https://3k-game-server.onrender.com',
    );
    expect(toHttpUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('tolerates the trailing slash and whitespace a pasted URL arrives with', () => {
    expect(toHttpUrl('  https://example.com/  ')).toBe('https://example.com');
  });
});

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

const render = () =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <LobbyPage />
    </I18nextProvider>,
  );

describe('LobbyPage', () => {
  it('opens on the create/join form (no session, no server contact)', () => {
    const html = render();
    expect(html).toContain('Create a room');
    expect(html).toContain('Join a room');
    // Every supported table size is offered — the game is 4–8 players.
    for (const n of [4, 5, 6, 7, 8]) {
      expect(html).toContain(`value="${n}"`);
    }
  });

  it('renders through i18next in both languages, never a raw key', async () => {
    for (const lng of ['en', 'zh']) {
      await i18n.changeLanguage(lng);
      const html = render();
      expect(html).not.toMatch(/lobby\.[a-z_.]+/);
      expect(html).not.toMatch(/ui\.[a-z_.]+/);
    }
    await i18n.changeLanguage('en');
  });
});

// ── task 5.2: the general-selection screen ────────────────────────────────

const CANDIDATES = generals.slice(0, 3).map((g) => g.id);
const OTHERS_CANDIDATES = generals.slice(3, 6).map((g) => g.id);

const selectionOf = (over: Partial<SelectionView> = {}): SelectionView => ({
  lord: '0',
  awaiting: ['1'],
  candidates: CANDIDATES,
  lockedIn: ['0'],
  lordGeneralId: generals[7].id,
  myPick: null,
  ...over,
});

const renderSelect = (selection: SelectionView, viewerId: string | null) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <GeneralSelect selection={selection} viewerId={viewerId} onPick={() => {}} />
    </I18nextProvider>,
  );

describe('GeneralSelect', () => {
  it('offers you your own candidates once it is your turn to pick', () => {
    const html = renderSelect(selectionOf(), '1');
    for (const id of CANDIDATES) {
      expect(html).toContain(generals.find((g) => g.id === id)!.enName);
    }
    // The Lord picked first and in the open — that's the point of the window.
    expect(html).toContain(generals[7].enName);
  });

  it('cannot show a general it was never sent — the filtering is the server’s', () => {
    // playerView only ever sends *your* candidates; an opponent's simply aren't
    // in the props. This asserts the component doesn't invent them from the
    // content files (it has the whole generals list imported, after all).
    const html = renderSelect(selectionOf(), '1');
    for (const id of OTHERS_CANDIDATES) {
      expect(html).not.toContain(generals.find((g) => g.id === id)!.enName);
    }
  });

  it('shows the Lord as still choosing before they reveal, and offers nothing to anyone else', () => {
    const html = renderSelect(
      selectionOf({ awaiting: ['0'], lockedIn: [], lordGeneralId: null }),
      '1',
    );
    expect(html).toContain('choosing first');
    for (const id of CANDIDATES) {
      expect(html).not.toContain(generals.find((g) => g.id === id)!.enName);
    }
  });

  it('waits, rather than offering a second pick, once you have locked in', () => {
    const html = renderSelect(
      selectionOf({ awaiting: ['2'], myPick: CANDIDATES[0], lockedIn: ['0', '1'] }),
      '1',
    );
    expect(html).not.toContain('<button');
    expect(html).toContain(generals.find((g) => g.id === CANDIDATES[0])!.enName);
  });
});

describe('the client-side skeleton game', () => {
  it('declares every stage and move the server has — a name it lacks is a move that never arrives', () => {
    const stages = ThreeKingdomsClientGame.turn!.stages!;
    expect(Object.keys(stages).sort()).toEqual(Object.keys(THREE_KINGDOMS_STAGE_MOVES).sort());
    for (const [stage, moves] of Object.entries(THREE_KINGDOMS_STAGE_MOVES)) {
      expect(Object.keys(stages[stage].moves!).sort()).toEqual([...moves].sort());
    }
  });

  it('carries no rules: every move is server-only', () => {
    for (const stage of Object.values(ThreeKingdomsClientGame.turn!.stages!)) {
      for (const move of Object.values(stage.moves!)) {
        expect(move).toMatchObject({ client: false });
      }
    }
  });
});
