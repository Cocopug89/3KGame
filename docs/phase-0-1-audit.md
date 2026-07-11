# Phase 0 + Phase 1 integrity audit

**Date:** 2026-07-11 · **Trigger:** dependency check before starting Phase 2 (engine).
**Verdict:** Phase 1 *data* was sound. Phase 0 *scaffold* had four defects, two of which would have
broken a production deploy. All are fixed; the repo now installs, builds, tests and starts clean from
a fresh clone.

## Method

The repo was copied to an isolated scratch dir (per the Drive-sync gotcha in `CONTINUE.md`) and put
through what a fresh clone / CI / Render actually does: `npm ci` → `npm run build` → `npm test` →
`npm start`. The content JSON was diffed programmatically against its own source of truth,
`docs/card-suit-rank-table.md`.

---

## 🔴 Defects found and fixed

### 1. `package-lock.json` was corrupt — **a fresh clone could not install**
`npm install` died with `npm error Invalid Version:`. The committed lockfile had ~280 of its 292
package entries with **no `version` field**. Anything starting from a clean checkout — a new
contributor, CI, **and both the Netlify and Render build steps** — would fail here.
**Fix:** lockfile regenerated (348 entries, 0 malformed). `npm ci` now succeeds.
*Probable cause: the same Drive-sync torn-write issue already documented in `CONTINUE.md`.*

### 2. Render deploy would build, then crash on boot
`server/render.yaml` and `DEPLOY.md` both said `buildCommand: npm install && npm run build`,
`startCommand: npm start` — run from the **repo root**. But this is an npm-workspaces monorepo and
the root `package.json` **has no `start` script**, so the service would build successfully and then
die immediately with `npm ERR! Missing script: "start"`.
**Fix:** `render.yaml` now uses `npm ci && npm run build -w server` / `npm start -w server`; a root
`start` script was added as a second line of defence; `DEPLOY.md` updated. Also dropped the hardcoded
`PORT: 3000` (Render injects `PORT`; hardcoding it is how you get a "no open ports detected" failure)
and added `CLIENT_ORIGIN` as an explicit, must-set env var.

### 3. `client/netlify.toml` was wrong twice, and the two errors cancelled out
It set `VITE_SERVER_URL = "wss://…"` under an `[env.production]` section.
- `[env]` **is not a valid netlify.toml section** (Netlify reads `[build.environment]` /
  `[context.<name>.environment]`), so the value was silently ignored.
- The value itself was wrong anyway: boardgame.io's SocketIO transport wants `host:port` or an
  `http(s)://` URL and negotiates the upgrade itself — `wss://` does not connect. `App.tsx`,
  `.env.example` and `DEPLOY.md` all say so; only `netlify.toml` disagreed.

So the config *looked* set, did nothing, and would have broken the client the moment someone
"fixed" the section name. **Fix:** removed, with a comment explaining both traps and the correct
`[context.production.environment]` form.

### 4. No test infrastructure existed at all
Root `package.json` ran `npm test -w client && npm test -w server`; **neither workspace defined a
`test` script**, and no test runner was installed. Phase 2.7 ("unit tests for 2.2–2.6", Haiku) had
nowhere to land, and the engine design's promise that the engine is testable without a server was
unenforced.
**Fix:** `vitest` added to both workspaces; `npm test` now runs green from the root.

---

## ⚠️ Smaller gaps fixed

- **Non-ASCII general ids.** `lü_bu` and `lü_meng` carried a `ü`. General ids become skill-handler
  filenames (`content/standard/skills/<id>.ts`), registry keys and probably URLs — a non-ASCII id is
  a bug waiting for Phase 4. Renamed to `lu_bu` / `lu_meng` in `generals.json` and both locale files.
  (Display names still read 吕布 / Lü Bu — only the id changed.) A test now enforces `^[a-z0-9_]+$`.
- **`CardData` was missing `horseDirection`.** The field is in `cards.json` but not in the client's
  TypeScript interface — and it's exactly what the Phase 2.5 distance calculation needs.

## ✅ Verified sound (no action needed)

- **`cards.json` is exact.** All 107 cards matched `docs/card-suit-rank-table.md` **card for card on
  (suit, rank, name)** — zero discrepancies in either direction. Unique ids, valid suits/ranks,
  correct type split (53 basic / 35 trick / 19 equipment) and correct per-card copy counts.
  The two `position` values carrying an `(EX)` suffix are the deliberate print-run annotation from
  the locked table, not typos.
- **`generals.json`:** 25 generals, kingdom split 7 Wei / 7 Shu / 8 Wu / 3 Qun, all HP 3–4.
- **`locales/`:** en and zh key sets are **identical** (96 keys each), no empty values, no
  accidentally-untranslated strings, every general and every distinct card name keyed.
  *(Note: `PHASE_1_PROGRESS.md` claims "107 keys" — the real number is 96, since card copies share a
  key. The file, not the count, was right.)*
- Client typechecks (`tsc -b`) and builds; server typechecks and emits; server boots and honours
  `PORT`.

## Regression guard

The data checks above are no longer a one-off — they're `server/test/content.test.ts` (12 tests),
run by `npm test`. Anything touching `content/standard/*.json` or `locales/*.json` should run it.
It also carries one `it.todo` for the `effectKey` / weapon `range` fields that **task 2.2a** must add.

## Still outstanding (by design — these are Phase 2 tasks, not Phase 0/1 debt)

- `effectKey` on all 107 cards + `range` on the 10 weapon cards — **task 2.2a**, blocks the engine.
- `shared/` workspace; `client/src/game.ts` and `server/src/game.ts` are still hand-duplicated — 2.2a.
- ⚠️ **`server/tsconfig.json` sets `"rootDir": "./src"`.** The moment the engine imports
  `content/standard/*.json` or a `shared/` module from outside `src/`, `tsc` will fail with
  *"is not under rootDir"*. Whoever does 2.2a should make `shared/` a real workspace package
  (imported by name, resolved through `node_modules`) rather than reaching up the tree with `../../`.
