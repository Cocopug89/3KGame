// Task 5.3 — reconnection, from the client's side.
//
// Two things are worth pinning down, and neither is about the socket itself
// (boardgame.io owns that):
//
//   1. the stored session is the reconnection handle. A refresh mid-match must
//      re-attach with the credentials it already holds — never re-join, because
//      bgio's /leave wipes a match once its last named player is gone and a
//      second joinMatch on your own seat is a 409. `atTable` is what tells a
//      reloaded tab it belongs at the table and not back in the seat list.
//   2. a dropped socket must NOT take the table off the screen. The board keeps
//      rendering the last authoritative snapshot with a banner over it; only a
//      client that has never synced shows a spinner.
//
// Rendered to a string like the other client tests, so TableBoard is exercised
// as a plain component with hand-made BoardProps — mounting the real
// boardgame.io <Client> would open a socket, which is exactly the thing under
// test being simulated.

import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { createInstance, type i18n as I18n } from 'i18next';
import type { BoardProps } from 'boardgame.io/react';
import en from '../../locales/en.json';
import zh from '../../locales/zh.json';
import { TableBoard } from '../src/lobby/TableView';
import { clearSession, loadSession, saveSession, type LobbySession } from '../src/lobby/lobbyApi';
import { FIXTURES } from '../src/game/fixtures';
import type { TableState } from '../src/game/viewTypes';

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

// ── the session (localStorage isn't in the node test environment) ──────────

class MemoryStorage {
  private data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}

const SESSION: LobbySession = {
  roomCode: 'KHMPT',
  matchID: 'match-1',
  playerID: '2',
  playerName: 'Coco',
  credentials: 'secret',
};

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe('the stored session', () => {
  it('round-trips the credentials a refreshed tab re-attaches with', () => {
    saveSession(SESSION);
    expect(loadSession()).toEqual(SESSION);
  });

  it('remembers that you were at the table, so a refresh goes back to it', () => {
    saveSession({ ...SESSION, atTable: true });
    expect(loadSession()?.atTable).toBe(true);
  });

  it('defaults to "not at the table" — a seated player still has to enter it', () => {
    saveSession(SESSION);
    expect(loadSession()?.atTable).toBeUndefined();
  });

  it('is dropped whole, not half — a torn session must not resurrect a seat', () => {
    localStorage.setItem('3k-session', JSON.stringify({ roomCode: 'KHMPT' })); // no credentials
    expect(loadSession()).toBeNull();
    saveSession(SESSION);
    clearSession();
    expect(loadSession()).toBeNull();
  });
});

// ── the board through a dropped socket ─────────────────────────────────────

const live = FIXTURES.find((f) => f.id === '4p · opening')!;

const boardProps = (over: {
  G?: TableState | null;
  isConnected: boolean;
}): BoardProps<TableState> =>
  ({
    G: over.G === undefined ? live.state : over.G,
    ctx: {},
    moves: {},
    playerID: live.viewerId,
    isConnected: over.isConnected,
  }) as unknown as BoardProps<TableState>;

const renderBoard = (props: BoardProps<TableState>) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <TableBoard {...props} />
    </I18nextProvider>,
  );

describe('TableBoard while the socket is down', () => {
  it('keeps the last snapshot on screen and banners it, rather than blanking the table', () => {
    const html = renderBoard(boardProps({ isConnected: false }));
    expect(html).toContain('reconnect-banner');
    expect(html).toContain(en['lobby.reconnecting']);
    // The table is still there: the viewer's own hand, the seats, the HP.
    expect(html).toContain('class="hand"');
    expect(html).not.toContain(en['lobby.connecting']);
  });

  it('shows a spinner ONLY when it has never had a snapshot', () => {
    const html = renderBoard(boardProps({ G: null, isConnected: false }));
    expect(html).toContain(en['lobby.connecting']);
    expect(html).not.toContain('reconnect-banner');
  });

  it('says nothing at all when the socket is up', () => {
    const html = renderBoard(boardProps({ isConnected: true }));
    expect(html).not.toContain('reconnect-banner');
    expect(html).not.toContain(en['lobby.connecting']);
  });

  it('renders the banner through i18next in both languages, never a raw key', async () => {
    for (const lng of ['en', 'zh']) {
      await i18n.changeLanguage(lng);
      const html = renderBoard(boardProps({ isConnected: false }));
      expect(html).toContain(lng === 'zh' ? zh['lobby.reconnecting'] : en['lobby.reconnecting']);
      expect(html).not.toMatch(/lobby\.[a-z_.]+/);
    }
    await i18n.changeLanguage('en');
  });
});
