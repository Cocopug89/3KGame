# Phase 0: Scaffold — Setup & Running Locally

## ✅ What's been set up

**Monorepo structure:**
- Root `package.json` with workspaces for `/client` and `/server`
- **Client**: Vite + React 18 + TypeScript, ready for Netlify
- **Server**: boardgame.io + Node + TypeScript, ready for Render
- Concurrent dev runner via `npm run dev` (runs client + server in parallel)
- `.gitignore`, TypeScript configs, and deployment configs

**Client app** (`/client`):
- React app at `src/App.tsx`
- Connects to server over WebSocket
- Displays synced counter state from server
- "Increment" button sends an action to update server state
- Netlify deployment config (`netlify.toml`)

**Server** (`/server`):
- boardgame.io game server with a minimal counter game
- `CounterGame` with setup and `increment` move
- Render deployment config (`render.yaml`)

---

## 🚀 Running Locally

### 1. Install dependencies
```bash
npm install
```

This installs root-level `concurrently` and both workspaces (`client` + `server`).

### 2. Start dev servers (both at once)
```bash
npm run dev
```

This runs:
- **Client** on `http://localhost:5173` (Vite default)
- **Server** on `http://localhost:3000`

Both will auto-reload on changes.

### 3. Test the sync
1. Open `http://localhost:5173` in your browser
2. You should see "Server state synced: Count = 0"
3. Click "Increment"
4. Count increments on the page

**If it doesn't work**, check:
- Server is running: look for `🎮 Three Kingdoms Kill Server running on port 3000` in the terminal
- Client can reach server: check browser console (F12) for connection errors
- WebSocket URL: Client connects to `ws://localhost:3000` by default

### 4. Run client or server alone (if needed)
```bash
npm run dev:client   # Just the React app
npm run dev:server   # Just the boardgame.io server
```

---

## 📦 Building for deployment

### Build both
```bash
npm run build
```

### Build client only
```bash
npm run build -w client
# Output: `/client/dist` (deploy to Netlify)
```

### Build server only
```bash
npm run build -w server
# Output: `/server/dist` (deploy to Render)
```

---

## Next: Deploy to Netlify & Render

See Tasks #6 and #7. You'll need:
1. **Netlify account** → connect the repo, set `VITE_SERVER_URL` env var to deployed server
2. **Render account** → create a free web service, point to `/server`

Once both are deployed, they'll communicate over the public internet via WebSocket.

---

## 🎮 Next phase (Phase 1)

Phase 1 builds the content layer:
- Turn §3 of `three-kingdoms-plan.md` into `cards.json`, `generals.json`
- Create bilingual i18n files (`zh.json`, `en.json`)
- Add a card gallery to test the i18n toggle
