// Task 5.1. Kept in its own module (and free of any boardgame.io import) so
// the normalization rule can be unit-tested without pulling a socket client
// into the test.

/**
 * boardgame.io's SocketIO transport accepts a bare `host:port`, but `fetch`
 * does not — the lobby REST calls need a real absolute URL. Both read the
 * same VITE_SERVER_URL, so this is where the two conventions are reconciled:
 * a value with no protocol gets `http://` (which is what socket.io would have
 * defaulted to anyway). In production VITE_SERVER_URL should be an explicit
 * https:// URL, or the browser blocks it as mixed content.
 */
export function toHttpUrl(serverUrl: string): string {
  const trimmed = serverUrl.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export const SERVER_URL: string = import.meta.env.VITE_SERVER_URL || 'localhost:3000';
export const LOBBY_URL: string = toHttpUrl(SERVER_URL);
