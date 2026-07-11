import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { GalleryPage } from './GalleryPage';
import { TablePage } from './TablePage';
import { LobbyPage } from './lobby/LobbyPage';
import './i18n';
import './index.css';

// The lobby (task 5.1) is the front door: create a room, share the code, take
// a seat, sit down at the table.
//
// The other entry points stay reachable for their own checklists:
//   ?table   — task 6.1's fixture-driven table harness (no server needed)
//   ?gallery — the Phase 1.5 card/general gallery
//   ?phase0  — the Phase 0 boardgame.io counter smoke test (see VERIFY.md)
const params = new URLSearchParams(window.location.search);

function Root() {
  if (params.has('phase0')) return <App matchID="default" playerID="0" />;
  if (params.has('table')) return <TablePage />;
  if (params.has('gallery')) return <GalleryPage />;
  return <LobbyPage />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
