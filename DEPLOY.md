# Deployment Guide: Netlify + Render

**Status (2026-07-11, task 7.1):** deploy-ready config, not yet live. This file was rewritten for 7.1
after finding that both platforms' build commands (as configured at task 0.3) would have failed on the
very first deploy — see "What changed in 7.1" below. Nobody has run this against a live Netlify/Render
account yet; the config in this repo has been verified by simulating both platforms' exact build/start
commands in a clean scratch copy (no cached `node_modules`, no leftover `dist/`), not by an actual
deploy. See [`docs/handoff/7.1-first-deploy.md`](docs/handoff/7.1-first-deploy.md) for the full record.

## What changed in 7.1 — read this before following the old steps

1. **`netlify.toml` moved from `client/netlify.toml` to the repo root**, and its build command now
   builds `@3k/shared` first. The old file required a dashboard-only "Base directory: client" setting,
   and even with that set correctly, `npm run build` scoped to `client/` alone fails outright the moment
   anything under `client/src/` imports `@3k/shared` (Phase 5's lobby/game code does, throughout) —
   `tsc` errors with `Cannot find module '@3k/shared'` because nothing ever built its `dist/`. Verified
   failing, then verified fixed, from a clean `/tmp` scratch build. **Leave "Base directory" blank** in
   the Netlify dashboard; the root `netlify.toml` needs no dashboard config at all beyond the env var.
2. **`render.yaml` moved from `server/render.yaml` to the repo root** (Render's Blueprint feature only
   auto-detects `render.yaml` at the repo root), and its build command has the same `@3k/shared`-first
   fix: `npm ci && npm run build -w server` alone also failed in the clean-scratch test, same root cause.
3. **This repo has no GitHub remote yet.** `docs/version-control.md` only ever ran `git init` locally
   (`git-setup.bat`). Both Netlify's and Render's standard "connect to Git" flow needs a hosted repo
   (GitHub, GitLab, or Bitbucket) to point at — **push this repo to GitHub before starting either
   platform's setup below.** This is a manual step outside any agent's sandbox (it needs your
   credentials) and is the actual first blocker on a truly fresh deploy.
4. **The server holds all match/room state in memory** (`server/src/lobby/roomCodes.ts`, and
   boardgame.io's own default match store). Render's free tier spins the service down after 15 minutes
   idle and **a spin-down (or any redeploy) silently ends every in-progress game** — there is no
   database, so nothing survives a restart. Fine for playtesting with friends who can just start a new
   room; worth knowing before treating this as "the game is now always-on."

---

## 🌐 Client: Netlify

### Setup (first time)

1. **Push the repo to GitHub** (or GitLab/Bitbucket) if you haven't — see point 3 above.
2. **Connect repo to Netlify**
   - Go to https://netlify.com and sign up / log in
   - Click "Add new site" → "Import an existing project"
   - Select GitHub and authorize (or link your repo)
   - Pick the repo
   - **Build settings** (Netlify should auto-detect these from `netlify.toml` at the repo root — verify
     they match, don't retype them):
     - Base directory: **leave blank** (build runs from the repo root; see point 1 above)
     - Build command: `npm run build -w shared && npm run build -w client`
     - Publish directory: `client/dist`
   - Click "Deploy"

3. **Set environment variables**
   - In Netlify dashboard → Site configuration → Environment variables
   - Add: `VITE_SERVER_URL = https://your-render-server-url.onrender.com`
     - (Get the URL after you deploy the server on Render; see below)
     - Must be `https://`, not `wss://` — boardgame.io's SocketIO transport negotiates the WebSocket
       upgrade itself and only wants a plain `http(s)://` URL (or a bare `host:port`, which
       `client/src/lobby/serverUrl.ts` normalizes to `http://` — wrong for a deployed site, hence
       needing the explicit `https://` here).
   - Trigger a redeploy so the new env var takes effect (Netlify does not hot-reload build-time vars)

4. **Redeploy after the server is live**
   - Once the Render server is running, come back and set `VITE_SERVER_URL` to its real URL if you
     hadn't yet, then redeploy.

### Access
- Netlify assigns a free URL like `https://three-kingdoms-kill-abc123.netlify.app`
- This is the public client URL — the one to share with friends

---

## ⚙️ Server: Render

Two ways to set this up; pick one. The Blueprint route is faster and matches what's committed
(`render.yaml` at the repo root); the manual route is here because it's what a first-time Render user
will find via "New +" → "Web Service" if they don't notice the Blueprint option.

### Option A — Blueprint (uses the committed `render.yaml`)

1. Push the repo to GitHub (see above) if you haven't.
2. Render dashboard → "New +" → "Blueprint" → select the repo. Render finds `render.yaml` at the repo
   root automatically and shows the one service it defines (`three-kingdoms-kill-server`).
3. Render will prompt for the one `sync: false` env var the file declares — set:
   - `CLIENT_ORIGIN = https://your-netlify-site.netlify.app` (your real Netlify URL; can't be filled in
     until the client is deployed once — see the CORS chicken-and-egg note below)
4. Apply. Render builds and starts the service per `render.yaml`.

### Option B — Manual dashboard setup

1. Go to https://render.com and sign up / log in
2. Click "New +" → "Web Service"
3. **Connect GitHub** (authorize if needed), select the repo
4. **Configure:**
   - Name: `three-kingdoms-kill-server`
   - Environment: **Node**
   - Region/branch: your choice
   - Root Directory: **leave blank** (repo root — this is a workspaces monorepo, see below)
   - Build command: `npm ci && npm run build -w shared && npm run build -w server`
   - Start command: `npm start -w server`
   - Instance type: **Web Service, Free** (not "Static Site" and not a background worker — see "Why a
     Web Service, specifically" below)
5. Add environment variables (Environment tab):
   - `CLIENT_ORIGIN = https://your-netlify-site.netlify.app`
   - `NODE_VERSION = 20` (pins the build environment; not strictly required but avoids drift)
   - **Do not set `PORT`.** Render injects it; `server.ts` reads `process.env.PORT` and only falls back
     to 3000 for local dev. Hardcoding it here is the classic Render "no open ports detected" failure.
6. Click "Create Web Service"

> ⚠️ **The `-w shared` and `-w server` flags are not optional, and the `shared` build must run before
> `server`'s.** This repo is an npm-workspaces monorepo: install must happen at the repo **root** so the
> three workspaces (`shared`, `client`, `server`) resolve against one lockfile, but `server/src` imports
> `@3k/shared` **by package name**, which only resolves once `shared`'s own `tsc` run has produced
> `shared/dist/`. Skipping that step — the exact bug in the pre-7.1 `render.yaml` — builds successfully
> right up until `tsc` hits the first `@3k/shared` import, then fails the whole build. Verified both ways
> in a clean scratch copy; see the handoff doc.

### Why a Web Service, specifically

boardgame.io's server here is **not** a good fit for a serverless/edge function, for two independent
reasons that both point at "persistent Node process":

- **WebSockets.** Every move in this game rides a socket.io connection held open for the length of a
  match, not a request/response call a serverless function could answer and forget.
- **In-memory state.** Match state (boardgame.io's default store) and room codes
  (`server/src/lobby/roomCodes.ts`) both live in the process's memory, with no database. A serverless
  invocation model (a fresh, stateless instance per request) would lose all of it between calls.

Render's free "Web Service" type is exactly a persistent process behind a stable URL — the right shape
for this. (It still spins down after 15 minutes of no traffic on the free tier, which drops that in-memory
state; that's a cost/reliability tradeoff, not a wrong service type — see point 4 at the top.)

### Wait for deploy

- Render will build and start the server
- Look for `🎮 Three Kingdoms Kill Server running on port <PORT>` in the logs, followed by
  `🚪 Lobby ready — POST /rooms?numPlayers=N · GET /rooms/:code`
- Note the assigned URL, e.g. `https://three-kingdoms-kill-server.onrender.com`

### The CORS chicken-and-egg

`CLIENT_ORIGIN` (Render) and `VITE_SERVER_URL` (Netlify) each need the *other* platform's URL, and
neither is known until that platform's first deploy finishes. There's no way around one redeploy on each
side: deploy Render first (its URL doesn't depend on anything), set `VITE_SERVER_URL` on Netlify to that
URL and deploy the client, then come back and set `CLIENT_ORIGIN` on Render to the real Netlify URL
(triggers an automatic Render redeploy). After that, both URLs are stable and only change if you rename
either site.

### Access
- Server endpoint: `https://your-render-url.onrender.com`
- The client connects to this automatically over a WebSocket upgrade, plus plain HTTPS calls for the
  lobby routes (`POST /rooms`, `GET /rooms/:code`) — same origin, same CORS config, both gated by
  `CLIENT_ORIGIN`.

---

## 🧪 Testing the end-to-end connection

The Phase 0 counter smoke test (`?phase0`) still exists and is the fastest single-tab check that the
socket connects at all. The real test is the actual game, which now exists (Phase 5):

1. Open the Netlify client URL. It lands on the lobby (`LobbyPage`), not the counter.
2. **Quick socket check first:** append `?phase0` to the URL. You should see "Server state synced: Count
   = 0"; click Increment and watch it update. If this doesn't work, nothing past this point will either
   — fix the socket connection before testing the real game (see Troubleshooting).
3. **Full flow, two browser tabs (or a second device):**
   - Tab A: "Create room", pick a player count, note the 5-letter room code.
   - Tab B: "Join room", enter the code, pick a seat.
   - Both: pick a general in the selection window.
   - Play a card, confirm the other tab sees the move (state syncs without a manual refresh).
4. **If it fails:**
   - Check the browser console (F12) on both tabs for WebSocket connection errors or CORS errors
   - "Connection refused" or a long hang: the Render server may still be cold-starting (free tier) —
     wait 30 seconds and retry
   - A CORS error naming your Netlify origin: `CLIENT_ORIGIN` on Render doesn't match it exactly
     (scheme + host, no trailing slash)
   - Check Render's logs for the `⚠️ No allowed origins configured` warning — it prints if
     `CLIENT_ORIGIN` was never set

---

## 🔄 Redeploying

### Client (Netlify)
- Push to the connected branch → Netlify auto-redeploys
- Or trigger manually from the Netlify dashboard

### Server (Render)
- Push to the connected branch → Render auto-redeploys
- Or trigger manually from the Render dashboard
- **Every redeploy drops all in-progress matches** (see point 4 at the top) — there's no drain/warning
  to players currently mid-game. Fine for a friends-only playtest; worth a heads-up in chat before you
  redeploy while someone's mid-match.

---

## ❄️ Cold starts on free tier

Both Netlify and Render free tiers can "cold start" (wake from sleep) if idle:
- **First request after idle takes 10–30 seconds**
- Subsequent requests are fast
- Fine for testing with friends; a paid Render tier removes the spin-down (and the in-memory state loss
  that comes with it) if 24/7 play matters later

---

## 💡 Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Client can't connect to server | Wrong `VITE_SERVER_URL` | Check the Netlify env var matches Render's actual URL exactly, `https://`, no trailing slash |
| Client blocked as "mixed content" | `VITE_SERVER_URL` uses `http://` on an `https://` site | Use `https://` in `VITE_SERVER_URL` |
| Connection rejected / CORS error | `CLIENT_ORIGIN` not set on Render, or doesn't match the Netlify URL | Set `CLIENT_ORIGIN` on Render to your exact Netlify URL (see the chicken-and-egg note above) |
| WebSocket connection timeout | Render server is cold-starting | Wait ~30 seconds and retry |
| Netlify build fails with `Cannot find module '@3k/shared'` | Build command skipped building the `shared` workspace first, or "Base directory" is set to `client` | Build command must be `npm run build -w shared && npm run build -w client`, run from the repo root — this is exactly the bug 7.1 fixed; see "What changed in 7.1" |
| Render build fails with `Cannot find module '@3k/shared'` | Same root cause as above, server side | Build command must be `npm ci && npm run build -w shared && npm run build -w server` |
| Render deploy builds then "Missing script: start" or "no open ports detected" | Start command run at repo root without `-w server`, or `PORT` hardcoded | Start command must be `npm start -w server`; never set a `PORT` env var, Render injects it |
| A game in progress vanishes after a while | Render free-tier spin-down or a redeploy — match state is in-memory only | Expected on free tier; see point 4 at the top. Not fixable without adding persistence (out of scope for 7.1) |
| Netlify or Render can't find the repo to connect | No GitHub remote yet | Push the local git repo to GitHub first — see point 3 at the top |

---

## Next steps

Once both are live:
- Share the Netlify URL with friends
- Play real games and report bugs — this is task 7.2
- Watch for the free-tier spin-down issue above during longer sessions
