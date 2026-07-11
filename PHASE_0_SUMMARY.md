# Phase 0: Scaffold — Complete ✅

## 📦 What's been delivered

A fully functional, production-ready monorepo scaffold for Three Kingdoms Kill.

### Folder structure
```
3K GAME/
├── client/                   Vite + React + TS frontend
│   ├── src/
│   │   ├── main.tsx         React entry point
│   │   ├── App.tsx          WebSocket client, counter demo
│   │   └── index.css        Base styles
│   ├── index.html           HTML template
│   ├── vite.config.ts       Vite build config
│   ├── tsconfig.json        TS strict mode
│   ├── package.json         Client deps: react, react-dom, vite
│   ├── netlify.toml         Netlify deploy config
│   └── .env.example         Environment variable template
│
├── server/                   boardgame.io + Node + TS backend
│   ├── src/
│   │   └── server.ts        Game server with counter game
│   ├── tsconfig.json        TS config (ES2020)
│   ├── package.json         Server deps: boardgame.io
│   └── render.yaml          Render deploy config
│
├── package.json             Root monorepo (workspaces + concurrently)
├── .gitignore               Standard git ignores
├── README.md                Project overview
├── PHASE_0.md              Local setup guide
├── DEPLOY.md               Netlify + Render deployment steps
├── VERIFY.md               End-to-end testing checklist
└── three-kingdoms-plan.md  Full game ruleset & build plan
```

---

## 🎯 What it does

1. **React client** connects to server over WebSocket
2. **Displays synced state** from the server (a counter in this case)
3. **Sends actions** to server (increment button)
4. **Server updates state** and broadcasts back to all clients
5. **Multiple clients stay in sync** (open in 2 browser tabs to see)

This proves the entire architecture works before we build the actual game engine.

---

## 🚀 Quick start

### Local development (first time setup)
```bash
npm install
npm run dev
```
Open `http://localhost:5173` → click "Increment" → watch the counter sync.

### Deploy to production
See `DEPLOY.md` for Netlify + Render setup (15–20 minutes).

### Verify everything works
See `VERIFY.md` for a complete testing checklist.

---

## 🔧 Tech decisions locked in

| Layer | Tech | Why |
|-------|------|-----|
| Framework | **boardgame.io** | Purpose-built for turn-based games, handles server-authoritative state & hidden information |
| Client | **React 18 + Vite + TS** | Fast dev + build, component-friendly, full type safety |
| Server | **Node.js + boardgame.io** | Lightweight, runs on free tier, handles WebSocket multiplayer |
| Frontend host | **Netlify** (free) | One-click deploy, auto-build from git, custom domains |
| Backend host | **Render** (free) | Persistent server, free tier, WebSocket support |

---

## 📋 What's NOT in this phase

- ❌ Game rules (the 6-phase turn loop, cards, skills)
- ❌ Bilingual strings (client shows placeholder text)
- ❌ Card/general data
- ❌ Trick cards, equipment, damage calculations
- ❌ General skills
- ❌ Lobby, roles, room management
- ❌ Animations or polish

These come in Phases 1–6.

---

## 🎮 Next steps

### Phase 1 (1–2 days): Data & i18n
- Turn `three-kingdoms-plan.md` §3 into JSON:
  - `cards.json` (all 108 cards with suits/ranks)
  - `generals.json` (25 generals + skills)
  - `zh.json` + `en.json` (bilingual strings)
- Add a card gallery to the client
- Test the language toggle

### Phase 2 (3–5 days): Core engine
- 6-phase turn loop
- Draw pile / hand management
- **杀 (Strike)** / **闪 (Dodge)** / **桃 (Peach)** mechanics
- Distance & range
- Dying & rescue
- Playable end-to-end (with placeholder generals)

### Phases 3–7
See `three-kingdoms-plan.md` §7 for the full build roadmap.

---

## 📞 Support

- **Local dev issues?** Check `PHASE_0.md` troubleshooting
- **Deploy stuck?** See `DEPLOY.md` FAQs
- **Want to verify it works?** Run through `VERIFY.md` checklist
- **Questions on the game rules?** Read `three-kingdoms-plan.md`

---

## ✨ You're ready!

The scaffold is rock-solid. You can:
- ✅ Run locally (dev and build)
- ✅ Deploy to the cloud (Netlify + Render)
- ✅ Share the URL with friends
- ✅ Extend with game rules in Phase 1

Go build the game. 🎮

---

**Phase 0 completed:** July 11, 2026  
**Time estimate:** 1 day ✅  
**Status:** Ready for Phase 1
