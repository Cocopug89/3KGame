// Task 5.1/5.2/5.3 — the live match: a real socket to the match the room code
// created, authenticated with the seat's credentials, rendering whatever the
// server's playerView chose to send.
//
// Two screens, one connection:
//   • G.selection ≠ null — the match hasn't been dealt yet; everyone is picking
//     a general (5.2). Nothing else in G is meaningful yet.
//   • otherwise — 6.1/6.2's board, with its `TableActions` wired straight to
//     boardgame.io's moves. That interface is exactly the seam 6.2 left for
//     Phase 5 ("wiring this to a live match is Phase 5's job"), which is why
//     this file is the only place in the client that knows moves exist.
//
// No rules are duplicated here: every method below just posts the move to the
// server and lets it answer (an illegal one comes back as INVALID_MOVE, which
// the prompt panel surfaces).

import { useEffect } from 'react';
import type { ComponentType } from 'react';
import { Client } from 'boardgame.io/react';
import type { BoardProps } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { useTranslation } from 'react-i18next';
import { GameTable } from '../components/table/GameTable';
import type { TableActions } from '../game/actions';
import type { TableState } from '../game/viewTypes';
import { GeneralSelect } from './GeneralSelect';
import { ThreeKingdomsClientGame } from './clientGame';
import { SERVER_URL } from './serverUrl';
import type { LobbySession } from './lobbyApi';

type Moves = BoardProps<TableState>['moves'];

function tableActions(moves: Moves): TableActions {
  return {
    playCard: (cardId, targets) => moves.playCard(cardId, targets),
    pass: () => moves.pass(),
    // 4.1b: 闪 / 桃 / 杀 / 无懈可击 are one move now — the card demand
    // (docs/skill-trigger-design.md §5). respondDodge/respondPeach are gone.
    supplyCards: (cardIds) => moves.supplyCards(cardIds),
    respondSkill: (use) => moves.respondSkill(use),
    discard: (cardIds) => moves.discard(cardIds),
    // A slot, never a card id — the server resolves it against live state
    // (engine/cardChoice.ts's resolveSlot), so a hand-crafted slot is an
    // INVALID_MOVE rather than a leak.
    chooseCard: (slot) => moves.chooseCard(slot),
    // Batch B/C (4.3, 4.4). THIS is the adapter that matters: a prompt with no
    // move behind it here is a table that hangs in a real match, no matter how
    // well the panel renders. The names are @3k/shared's THREE_KINGDOMS_STAGE_MOVES
    // — boardgame.io dispatches by name, so a typo is silently a no-op.
    chooseOption: (optionId) => moves.chooseOption(optionId),
    choosePlayer: (playerId) => moves.choosePlayer(playerId),
    declareSuit: (suit) => moves.declareSuit(suit),
    arrangeCards: (order) => moves.arrangeCards(order),
    submitRetrial: (cardId) => moves.submitRetrial(cardId),
    distributeCards: (assignments) => moves.distributeCards(assignments),
    redirectStrike: (cardId, newTarget) => moves.redirectStrike(cardId, newTarget),
  };
}

/**
 * Task 5.3 — reconnection, from the board's side.
 *
 * The distinction that matters is **never connected** vs. **connection lost**,
 * and the first cut of this conflated them (`!isConnected || !G?.players` →
 * "Connecting…"), which meant a two-second socket blip *replaced the whole
 * table* with a spinner: hand gone, prompt gone, and no way to tell whether
 * your last move landed.
 *
 *   • no G yet          → we have never synced. A spinner is all we can honestly
 *                         show, and this is also the state a refresh starts in.
 *   • G, but no socket  → we have a snapshot; it may just be stale. Keep the
 *                         table on screen, banner it, and let boardgame.io's
 *                         socket reconnect underneath us — it re-syncs the
 *                         authoritative state on its own, and because every move
 *                         is `client: false` (clientGame.ts) there is no
 *                         optimistic local state to diverge or roll back.
 *
 * We deliberately do NOT re-mount the client or re-join the seat on a
 * disconnect: re-joining is a 409 at best and, through bgio's /leave, a
 * destroyed match at worst. The credentials in the stored session ARE the
 * reconnection (lobbyApi.ts).
 */
export function TableBoard({
  G,
  playerID,
  moves,
  isConnected,
  onGameOver,
}: BoardProps<TableState> & { onGameOver?: () => void }) {
  const { t } = useTranslation();

  // 7.2's rematch: the board is the only thing that sees G.gameOver, and the
  // lobby (which owns the session) is the only thing that can act on it — so
  // this hook is the entire bridge between the two.
  const over = Boolean(G?.players && G.gameOver);
  useEffect(() => {
    if (over) onGameOver?.();
  }, [over, onGameOver]);

  // Before the first sync, G is the client's own (empty) initial state.
  if (!G?.players) {
    return <p>{t('lobby.connecting')}</p>;
  }

  return (
    <>
      {!isConnected && (
        <p role="status" className="reconnect-banner">
          {t('lobby.reconnecting')}
        </p>
      )}
      {G.selection ? (
        <GeneralSelect
          selection={G.selection}
          viewerId={playerID}
          onPick={(generalId) => moves.chooseGeneral(generalId)}
        />
      ) : (
        <GameTable state={G} viewerId={playerID} actions={tableActions(moves)} />
      )}
    </>
  );
}

// bgio's react Client FORWARDS any extra element props to the board at
// runtime (documented behaviour), but its own prop types don't admit them —
// hence the cast, which is also where `onGameOver` gets its real type.
const ThreeKingdomsClient = Client<TableState>({
  game: ThreeKingdomsClientGame,
  board: TableBoard,
  multiplayer: SocketIO({ server: SERVER_URL }),
  debug: false,
}) as unknown as ComponentType<{
  matchID: string;
  playerID: string;
  credentials: string;
  onGameOver?: () => void;
}>;

export function TableView({
  session,
  onGameOver,
}: {
  session: LobbySession;
  onGameOver?: () => void;
}) {
  return (
    <ThreeKingdomsClient
      matchID={session.matchID}
      playerID={session.playerID}
      credentials={session.credentials}
      onGameOver={onGameOver}
    />
  );
}
