# 三国杀 · Three Kingdoms Kill

A playable, bilingual (中文 / English) browser version of 三国杀 for our friends circle.
Online multiplayer · Standard edition (标准版) first · built to add expansions later.

## Status
Planning complete. See **[docs/three-kingdoms-plan.md](docs/three-kingdoms-plan.md)** for the full ruleset, card sets, bilingual terminology, architecture, and phased build plan.

## Folder layout
```
3K GAME/
├── docs/                  Plans & reference (ruleset, card data source of truth)
│   └── three-kingdoms-plan.md
├── content/               Game content as data (not code)
│   ├── standard/          Standard-edition v1
│   │   ├── cards.json     Every card: id, type, suit, rank, effectKey, i18nKey
│   │   ├── generals.json  25 generals: kingdom, maxHp, skillIds, i18nKey
│   │   └── skills/        One handler per general skill
│   └── expansions/        风/火/林/山, 军争 — added later, same shape
├── locales/               Bilingual strings for the UI toggle
│   ├── zh.json
│   └── en.json
├── client/                React + Vite + TS frontend (deploys to Netlify)
└── server/                Authoritative game server (boardgame.io, Node + TS)
```

## Why a server (important)
三国杀 is a hidden-information game. The browser can never hold the full deck or
other players' hands, or anyone could cheat via dev tools. The real rules run on
the server, which sends each player only what they're allowed to see.

## Next steps
1. Confirm the stack (boardgame.io + React/Vite on Netlify + Render).
2. Generate `content/standard/cards.json`, `generals.json`, and `locales/*.json` from the plan.
3. Lock the definitive card-by-card suit/rank table.
4. Build the core engine to a playable state.
