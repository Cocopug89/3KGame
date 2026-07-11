# Phase 0: Verification Checklist

Complete this checklist to verify the end-to-end scaffold is working.

## ✅ Local dev (before deploying)

- [ ] Run `npm install` in root (installs all workspaces)
- [ ] Run `npm run dev` (both client + server start)
- [ ] Open `http://localhost:5173` in browser
- [ ] See "Phase 0: Scaffold Test" heading
- [ ] See "Server state synced: Count = 0"
- [ ] Click "Increment" button
- [ ] Counter increments to 1, then 2, then 3, etc.
- [ ] Browser console (F12) shows no WebSocket errors
- [ ] Server terminal shows client connections
- [ ] Stop servers with Ctrl+C (graceful shutdown)

---

## ✅ Local stress test

- [ ] Run `npm run dev` again
- [ ] Spam "Increment" button 10 times
- [ ] All increments are received and synced
- [ ] No "action not allowed" errors
- [ ] No network timeouts
- [ ] Open the same URL in a second browser tab
- [ ] Both tabs show the same counter value
- [ ] Increment in tab 1, tab 2 updates in real-time
- [ ] Increment in tab 2, tab 1 updates in real-time

---

## ✅ Deployed: Netlify + Render

**Prerequisites:**
- [ ] Netlify account created
- [ ] Render account created
- [ ] GitHub repo pushed with all Phase 0 files

**Netlify deployment:**
- [ ] Connected GitHub repo to Netlify
- [ ] Build succeeded (check Netlify logs)
- [ ] Site is live at `https://three-kingdoms-kill-xyz.netlify.app`
- [ ] **Before next step:** Note the URL

**Render deployment:**
- [ ] Created web service on Render
- [ ] Connected GitHub repo
- [ ] Build succeeded (check Render logs)
- [ ] Server started (logs show 🎮 message)
- [ ] Server is live at `https://three-kingdoms-kill-server.onrender.com` (or similar)
- [ ] Note the URL

**Environment variables set:**
- [ ] Netlify: `VITE_SERVER_URL = https://three-kingdoms-kill-server.onrender.com`
  - (Replace with your actual Render URL; must be `https://`, not `wss://`)
- [ ] Render: `CLIENT_ORIGIN = https://three-kingdoms-kill-abc123.netlify.app`
  - (Replace with your actual Netlify URL; without this the server rejects the client)
- [ ] Netlify: Triggered a redeploy after setting env var

---

## ✅ Live end-to-end test

- [ ] Open the Netlify client URL in your browser
- [ ] **Wait 30 seconds** (Render cold-start)
- [ ] See "Three Kingdoms Kill" heading
- [ ] See "Phase 0: Scaffold Test" heading
- [ ] See "Server state synced: Count = 0"
  - If stuck on "Connecting to server..." → server is still cold-starting, wait longer
  - If red error → check Render logs and Netlify env vars
- [ ] Click "Increment"
- [ ] Counter increments (may be slower over the internet; 1–2 sec is normal)
- [ ] Open the URL in an incognito window (different browser session)
- [ ] Both windows show the same counter value
- [ ] Increment in one window, other window updates

---

## ✅ Code quality check

- [ ] No TypeScript errors: `cd client && npm run build` succeeds
- [ ] No TypeScript errors: `cd server && npm run build` succeeds
- [ ] `.gitignore` excludes `node_modules/`, `dist/`, `.env`
- [ ] No sensitive data in code (no API keys, etc.)
- [ ] `README.md` at root explains the project
- [ ] `PHASE_0.md` documents local setup
- [ ] `DEPLOY.md` documents deployment steps
- [ ] `VERIFY.md` (this file) documents testing

---

## 🎯 Success criteria

**Phase 0 is complete when:**
- [x] Monorepo builds and runs locally
- [x] Client and server connect over WebSocket (local)
- [x] State syncs between multiple client windows (local)
- [x] Client deploys to Netlify
- [x] Server deploys to Render
- [x] **Live connection works**: public client talks to public server
- [x] Multiple users on different devices can join and sync state

---

## 📝 Notes

- If **cold-start delays** are annoying, consider upgrading to Render's starter plan ($7/mo)
- If you want to test with friends now, share the Netlify URL
  - They'll see a shared counter that increments for everyone
  - This proves multiplayer sync works
- Next phase (Phase 1) adds the card and general data layers + bilingual support

---

## 🚀 Ready for Phase 1?

Once all checkmarks are green, move to **Phase 1: Data & i18n**

Phase 1 will:
1. Generate `cards.json` and `generals.json` from the plan
2. Create `zh.json` and `en.json` (bilingual strings)
3. Add a card gallery with language toggle
4. Prove the i18n layer works before building the game engine

See `three-kingdoms-plan.md` for details.
