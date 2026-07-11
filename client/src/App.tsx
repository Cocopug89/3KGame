import { Client } from 'boardgame.io/react';
import type { BoardProps } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { CounterGame, type CounterState } from '@3k/shared';

function CounterBoard({ G, moves, isConnected }: BoardProps<CounterState>) {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>三国杀 · Three Kingdoms Kill</h1>
      <h2>Phase 0: Scaffold Test</h2>

      {!isConnected && <p>Connecting to server...</p>}
      {isConnected && (
        <div>
          <p>Server state synced: Count = {G.count}</p>
          <button onClick={() => moves.increment()}>Increment</button>
        </div>
      )}
    </div>
  );
}

// The `SocketIO` transport wants a bare `host:port` or a `http(s)://` URL —
// NOT a `ws://`/`wss://` URL (socket.io negotiates the protocol upgrade
// itself). If no protocol is given it defaults to plain http, so in
// production always set VITE_SERVER_URL to an explicit https:// URL to
// avoid the browser blocking it as mixed content.
const serverUrl = import.meta.env.VITE_SERVER_URL || 'localhost:3000';

// matchID/playerID are passed as props (below, in main.tsx) rather than
// Client() options — boardgame.io's React client delegates those per-render
// instead of baking them into the wrapped component.
const App = Client<CounterState>({
  game: CounterGame,
  board: CounterBoard,
  multiplayer: SocketIO({ server: serverUrl }),
});

export default App;
