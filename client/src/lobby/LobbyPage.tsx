// Task 5.1 — create a room, share the code, pick a seat, sit down.
// Task 5.3 — and get back to your table after a refresh.
//
// Bare-bones on purpose: Phase 6 owns the look of everything. What has to be
// *right* here is the flow — seat order is turn order, so a player picks the
// seat, not a queue; the room polls, so you watch your friends arrive; and once
// you are at the table, a reload re-attaches you to it rather than dropping you
// back into a lobby you could accidentally destroy the match from.

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LobbyError,
  clearSession,
  createRoom,
  fetchRoom,
  joinSeat,
  leaveSeat,
  loadSession,
  saveSession,
  type LobbySession,
  type RoomSummary,
} from './lobbyApi';
import { TableView } from './TableView';
import { LanguageToggle } from '../components/LanguageToggle';

const PLAYER_COUNTS = [4, 5, 6, 7, 8];
const POLL_MS = 2000;

export function LobbyPage() {
  const { t } = useTranslation();

  const [session, setSession] = useState<LobbySession | null>(loadSession);
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [numPlayers, setNumPlayers] = useState(4);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Task 5.3: seeded from the stored session, so a refresh mid-match lands back
  // at the table instead of at the seat list. The socket re-attaches with the
  // credentials we already hold — see lobbyApi's "re-attach, never re-join".
  const [atTable, setAtTable] = useState(() => loadSession()?.atTable === true);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setErrorKey(null);
    try {
      await fn();
    } catch (err) {
      setErrorKey(err instanceof LobbyError ? err.i18nKey : 'lobby.error.server');
    } finally {
      setBusy(false);
    }
  }, []);

  const dropSession = useCallback(() => {
    clearSession();
    setSession(null);
    setAtTable(false);
  }, []);

  // A refresh lands here with a session but no room: re-resolve it. If the
  // room is gone (server restart, everyone left), drop the stale session
  // rather than showing a seat that no longer exists.
  useEffect(() => {
    if (!session || room) return;
    void fetchRoom(session.roomCode).then(setRoom).catch(dropSession);
  }, [session, room, dropSession]);

  // Watch the seats fill up. Pointless once we're at the table — the socket is
  // the source of truth from then on, and polling a room nobody can still join
  // is just noise.
  useEffect(() => {
    if (!room || atTable) return;
    const code = room.roomCode;
    const id = window.setInterval(() => {
      void fetchRoom(code)
        .then(setRoom)
        .catch(() => {
          /* transient — the next tick will tell us if it's real */
        });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [room?.roomCode, atTable]);

  const onEnterTable = () => {
    if (!session) return;
    const next = { ...session, atTable: true };
    saveSession(next); // survives the refresh — this IS the reconnection handle
    setSession(next);
    setAtTable(true);
  };

  // Note there is no "leave" here: bgio's /leave destroys the match once the
  // last named player is gone, so a mid-game exit would risk taking the table
  // with it. A player who wants out closes the tab; their seat stays in the
  // game, and the same session brings them back to it.
  if (session && atTable) {
    return (
      <Shell>
        <p>
          {t('lobby.room_code')}: <strong>{session.roomCode}</strong>
        </p>
        <TableView session={session} />
      </Shell>
    );
  }

  const onCreate = () =>
    run(async () => {
      if (!playerName.trim()) throw new LobbyError('lobby.error.name_required');
      const created = await createRoom(numPlayers);
      const { credentials } = await joinSeat(created.matchID, '0', playerName.trim());
      const next: LobbySession = {
        roomCode: created.roomCode,
        matchID: created.matchID,
        playerID: '0',
        playerName: playerName.trim(),
        credentials,
      };
      saveSession(next);
      setSession(next);
      setRoom(await fetchRoom(created.roomCode));
    });

  const onLookUp = () =>
    run(async () => {
      if (!playerName.trim()) throw new LobbyError('lobby.error.name_required');
      setRoom(await fetchRoom(codeInput));
    });

  const onTakeSeat = (playerID: string) =>
    run(async () => {
      if (!room) return;
      const { credentials } = await joinSeat(room.matchID, playerID, playerName.trim());
      const next: LobbySession = {
        roomCode: room.roomCode,
        matchID: room.matchID,
        playerID,
        playerName: playerName.trim(),
        credentials,
      };
      saveSession(next);
      setSession(next);
      setRoom(await fetchRoom(room.roomCode));
    });

  const onLeave = () =>
    run(async () => {
      if (session) {
        await leaveSeat(session.matchID, session.playerID, session.credentials);
      }
      dropSession();
      setRoom(null);
      setCodeInput('');
    });

  // ── in a room (seated, or looking at one after entering a code) ───────
  if (room) {
    return (
      <Shell>
        <p>
          {t('lobby.room_code')}: <strong style={{ fontSize: '1.6rem', letterSpacing: '0.2em' }}>{room.roomCode}</strong>
          <br />
          <span style={{ color: '#666' }}>{t('lobby.share_code')}</span>
        </p>

        <ol style={{ listStyle: 'none', padding: 0 }}>
          {room.seats.map((seat) => {
            const isMe = session?.playerID === seat.playerID;
            return (
              <li
                key={seat.playerID}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.4rem 0',
                  fontWeight: isMe ? 600 : 400,
                }}
              >
                <span style={{ width: '5rem', color: '#666' }}>
                  {t('lobby.seat')} {seat.seat}
                </span>
                <span style={{ minWidth: '8rem' }}>
                  {seat.name ?? <em style={{ color: '#999' }}>{t('lobby.empty_seat')}</em>}
                  {isMe ? ` (${t('lobby.you')})` : ''}
                </span>
                {!seat.name && !session && (
                  <button type="button" disabled={busy} onClick={() => onTakeSeat(seat.playerID)}>
                    {t('lobby.take_seat')}
                  </button>
                )}
              </li>
            );
          })}
        </ol>

        <p>
          {room.full
            ? t('lobby.room_full')
            : t('lobby.waiting_for_players', { n: room.numPlayers - room.joinedCount })}
        </p>

        {errorKey && <ErrorLine>{t(errorKey)}</ErrorLine>}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {session && (
            <button type="button" disabled={!room.full || busy} onClick={onEnterTable}>
              {t('lobby.enter_table')}
            </button>
          )}
          <button type="button" disabled={busy} onClick={onLeave}>
            {session ? t('lobby.leave') : t('ui.cancel')}
          </button>
        </div>
      </Shell>
    );
  }

  // ── not in a room yet ─────────────────────────────────────────────────
  return (
    <Shell>
      <label style={{ display: 'block', marginBottom: '1.5rem' }}>
        {t('lobby.your_name')}
        <br />
        <input
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          maxLength={20}
          style={{ padding: '0.4rem', minWidth: '14rem' }}
        />
      </label>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem' }}>{t('lobby.create_room')}</h2>
        <label>
          {t('lobby.player_count')}{' '}
          <select value={numPlayers} onChange={(e) => setNumPlayers(Number(e.target.value))}>
            {PLAYER_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>{' '}
        <button type="button" disabled={busy} onClick={onCreate}>
          {t('lobby.create')}
        </button>
      </section>

      <section>
        <h2 style={{ fontSize: '1.1rem' }}>{t('lobby.join_room')}</h2>
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
          placeholder={t('lobby.enter_code')}
          maxLength={7}
          style={{ padding: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.15em' }}
        />{' '}
        <button type="button" disabled={busy} onClick={onLookUp}>
          {t('lobby.join')}
        </button>
      </section>

      {errorKey && <ErrorLine>{t(errorKey)}</ErrorLine>}
    </Shell>
  );
}

function ErrorLine({ children }: { children: ReactNode }) {
  return <p style={{ color: '#c0392b' }}>{children}</p>;
}

function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 900, margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('lobby.title')}</h1>
        <LanguageToggle />
      </header>
      {children}
    </div>
  );
}
