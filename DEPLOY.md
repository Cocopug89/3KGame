# Deployment Guide: Netlify + Render

## 🌐 Client: Netlify

### Setup (first time)

1. **Connect repo to Netlify**
   - Go to https://netlify.com and sign up / log in
   - Click "New site from Git"
   - Select GitHub and authorize (or link your repo)
   - Pick the repo: `three-kingdoms-kill`
   - **Build settings:**
     - Base directory: *(leave blank — build from the repo root so npm workspaces resolve)*
     - Build command: `npm run build -w client`
     - Publish directory: `client/dist`
   - Click "Deploy"

2. **Set environment variables**
   - In Netlify dashboard → Site settings → Build & deploy → Environment
   - Add: `VITE_SERVER_URL = https://your-render-server-url.onrender.com`
     - (Get the URL after you deploy the server on Render; see below)
     - Must be `https://`, not `wss://` — boardgame.io's client negotiates
       the WebSocket upgrade itself and only wants a plain http(s) URL.
   - Save and redeploy

3. **Redeploy after server is live**
   - Once the Render server is running, go back to Netlify
   - Deploy settings → trigger a redeploy so the client knows the server URL

### Access
- Netlify assigns you a free URL like `https://three-kingdoms-kill-abc123.netlify.app`
- This is your public client URL

---

## ⚙️ Server: Render

### Setup (first time)

1. **Create a web service on Render**
   - Go to https://render.com and sign up / log in
   - Click "New +" → "Web Service"
   - **Connect GitHub** (authorize if needed)
   - Select the `three-kingdoms-kill` repo
   - **Configure:**
     - Name: `three-kingdoms-kill-server`
     - Environment: Node
     - Build command: `npm ci && npm run build -w server`
     - Start command: `npm start -w server`
     - Plan: **Free** (may have 15-min cold starts; acceptable for testing)
   - Click "Create Web Service"

   > ⚠️ **The `-w server` flags are not optional.** This repo is an npm-workspaces monorepo: install
   > must happen at the **root** (so the workspaces resolve), but the build and start must target the
   > **server** workspace. A bare root-level `npm start` fails — the root `package.json` has no
   > `start` script of its own. (It does now, as a fallback, but be explicit.)
   >
   > ⚠️ **Do not set `PORT`.** Render injects it; `server.ts` reads `process.env.PORT` and falls back
   > to 3000 locally. Hardcoding it is a classic "no open ports detected" deploy failure.

2. **Wait for deploy**
   - Render will build and start the server
   - Look for `🎮 Three Kingdoms Kill Server running on port 3000` in logs
   - Note the URL, e.g., `https://three-kingdoms-kill-server.onrender.com`

3. **Set the server's allowed origin**
   - In Render dashboard → Environment
   - Add: `CLIENT_ORIGIN = https://your-netlify-site.netlify.app`
     - (Your Netlify URL from step 1). Without this, the server rejects
       connections from your deployed client (CORS/origin check).
   - This triggers an automatic redeploy

4. **Update Netlify environment variable**
   - Go back to Netlify → Site settings → Environment
   - Change `VITE_SERVER_URL` to `https://three-kingdoms-kill-server.onrender.com`
   - Trigger a redeploy

### Access
- Server endpoint: `https://your-render-url.onrender.com`
- The client will connect to this automatically (over a WebSocket upgrade)

---

## 🧪 Testing the end-to-end connection

1. Open the Netlify client URL in your browser
2. Wait for "Server state synced: Count = 0" to appear
3. Click "Increment"
4. Count should increment
5. **If it fails:**
   - Check browser console (F12) for WebSocket connection errors
   - If "Connection refused", the Render server may still be starting (cold start)
   - Try again in 30 seconds
   - Check Render logs for errors

---

## 🔄 Redeploying

### Client (Netlify)
- Push to main branch → Netlify auto-redeploys
- Or manually trigger from Netlify dashboard

### Server (Render)
- Push to main branch → Render auto-redeploys
- Or manually trigger from Render dashboard

---

## ❄️ Cold starts on free tier

Both Netlify and Render free tier may "cold start" (wake up from sleep) if idle:
- **First request takes 10–30 seconds**
- Subsequent requests are fast
- This is fine for testing with friends; consider paid tier if 24/7 play is critical

---

## 💡 Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Client can't connect to server | Wrong `VITE_SERVER_URL` | Check Netlify env vars match Render's actual URL |
| Client blocked as "mixed content" | `VITE_SERVER_URL` uses `http://` on an `https://` site | Use `https://` in `VITE_SERVER_URL` |
| Connection rejected / CORS error | `CLIENT_ORIGIN` not set on Render, or doesn't match Netlify URL | Set `CLIENT_ORIGIN` on Render to your exact Netlify URL |
| WebSocket connection timeout | Render server is cold-starting | Wait 30 seconds and retry |
| Render deployment fails | Missing build command | Ensure `package.json` scripts exist (`build`, `start`) |
| Netlify build fails | Workspace not installed | Run `npm install` in root before pushing |

---

## Next steps

Once both are live:
- Share the Netlify URL with friends
- Play a game and report bugs
- Proceed to Phase 1: data & i18n
