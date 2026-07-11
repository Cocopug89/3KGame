# Finish-line workflow plan (written 2026-07-11)

Supersedes the "practical parallel-work suggestions" in
[`build-dependency-flowchart.md`](build-dependency-flowchart.md) for the remainder of the build.
Status source of truth is still [`build-breakdown.md`](build-breakdown.md); this doc answers
"what order, how many agents, and who owns which files" for the tasks that are left.

## What's left

| # | Task | Model | Blocked by (live status) |
|---|---|---|---|
| 3.4 (+3.3b) | Complex tricks incl. 五谷丰登, reveal-primitive design call | Sonnet | Nothing — 3.2 ✅ |
| 3.5 | Equipment zone (equip effect; `moveCards` already auto-discards a replaced equip) | Sonnet | Nothing |
| 3.6 | 11 weapon/armour handlers | Sonnet | 3.5 |
| 3.7 | Unit test per trick + equipment | Haiku | 3.4 + 3.6 |
| 4.2 | Batch A — 13 query skills | Haiku | Nothing for 12 of 13 (奇袭's dep 3.3 is ✅); **国色 needs 3.4** |
| 4.3 | Batch B — 12 reactive skills | Sonnet | Nothing (苦肉's F1 dep is ✅) |
| 4.4 | Batch C — 15 complex skills + Opus review | Sonnet, Opus review | Nothing hard (大乔/陆逊 reuse `cardChoice.ts`, which exists) |
| 4.5 | Unit test per skill (40) | Haiku | 4.2 + 4.3 + 4.4 |
| 5.4 | Anti-cheat audit of `playerView` | Opus/Fable | Formally nothing — **but see note below: run it after Phase 4** |
| 7.1 | First real deploy (Netlify + Render) | Sonnet | Nothing |
| 7.2 | Playtest + triage | Sonnet | Everything above |

Standing items to fold into whichever lane opens the right file (don't make them separate tasks):
**U1** (`legalTargets` on the `act` request — do it in 3.4, which owns `pump.ts` anyway) and
**F3** (write `G.log` entries as every new effect/skill lands — applies to 3.4/3.5/3.6/4.2/4.3/4.4).

**Move 5.4 to the end deliberately.** It formally only audits 5.1–5.3, but Phase 4 adds the last
hidden-information surfaces the audit exists for (观星 sees the draw pile, 反间/遗计 move hidden
cards, `confirmSkill` could leak what a player *could* answer). Auditing before Batch C means
auditing twice.

## File footprints (why the lanes are shaped this way)

| Task | Files it creates (exclusive) | Shared files it must touch |
|---|---|---|
| 3.4 | `content/effects/<trick>.ts` per trick | `effectRegistry.ts`, `pump.ts` + `frames.ts` (reveal primitive, U1), maybe `bgio/game.ts`, both locales |
| 3.5 | `content/effects/equip.ts` | `effectRegistry.ts`, both locales |
| 3.6 | handler files per weapon/armour | `equipmentTriggerRegistry.ts`, `equipmentQueryRegistry.ts`, `triggerSources.ts`, both locales |
| 3.7 | new test files only | none |
| 4.2/4.3/4.4 | one file per skill under `content/standard/skills/` | `skillRegistry.ts`/`skillSource.ts`, both locales |
| 4.5 | new test files only | none |
| 5.4 | audit doc | `engine/state.ts`/`playerView` only if it finds a leak |
| 7.1 | — | `netlify.toml`, Render config, `DEPLOY.md` — nothing any other lane touches |

The collision surfaces are exactly three: **the locale files** (every lane), **`effectRegistry.ts`**
(3.4 vs 3.5), and **`skillRegistry.ts`** (4.2 vs 4.3 vs 4.4). Everything else is
create-your-own-files work.

### Registry discipline (new rule for Phase 4's batches)

Each skill batch registers through **its own barrel file** — `skills/batchA.ts`, `batchB.ts`,
`batchC.ts` — and adds exactly **one import line** to `skillRegistry.ts`. That shrinks the
three-way registry conflict to one line per batch instead of 12–15 interleaved entries. 3.4 and
3.5 keep appending to `effectRegistry.ts` directly (few entries, two lanes), but surgically —
one `Edit` anchored on the previous entry, never a whole-file rewrite.

### Locale discipline (unchanged, restated because it keeps failing)

Every lane adds keys, so the CONTINUE.md rules are load-bearing: surgical anchored `Edit`s only,
never `json.load`→`dump`; re-read immediately before writing; record every locale addition in your
`docs/handoff/<task>.md`; run `server/test/content.test.ts` (parity) and `client/test/i18n.test.ts`
after every locale touch. `autosnapshot.bat` must be running before any wave starts.

## The plan — three waves

### Wave 1 — up to 4 agents

| Lane | Tasks | Model | Owns exclusively | Shares |
|---|---|---|---|---|
| **A — engine/tricks** | 3.4 + 3.3b + U1 + F3 logging; end with `snapshot.bat 3.4 done` | Sonnet | `pump.ts`, `frames.ts`, `bgio/game.ts`, new trick effects | `effectRegistry.ts` (with B), locales |
| **B — equipment** | 3.5 then 3.6 (sequential inside the lane) | Sonnet | equip effect + all weapon/armour handlers, both equipment registries, `triggerSources.ts` | `effectRegistry.ts` (with A, 3.5 only), locales |
| **C — skills A** | 4.2 **minus 国色** (12 skills), via `skills/batchA.ts` | Haiku | `content/standard/skills/*`, `skillRegistry.ts` (sole registry writer this wave) | locales |
| **D — deploy** | 7.1 | Sonnet | deploy configs | nothing |

Only A↔B share a code file (`effectRegistry.ts`), and only while B is on 3.5 — if you want zero
code-file contention, have B start with 3.6's handler files and register the equip effect last.
No lane but A touches the engine. C is the only `skillRegistry.ts` writer.

### Wave 2 — starts as Wave 1 lanes free up (up to 3 agents)

| Lane | Tasks | Model | Needs | Notes |
|---|---|---|---|---|
| **E — skills B** | 4.3 via `skills/batchB.ts` | Sonnet | 4.1b ✅ only | One import line into `skillRegistry.ts` |
| **F — skills C** | 4.4 (incl. 国色 pickup) via `skills/batchC.ts`, then the **Opus review** | Sonnet → Opus | 3.4 (for 国色; the other 15 can start immediately) | 大乔/陆逊: reuse `cardChoice.ts`, don't write a second slot protocol |
| **G — trick tests** | 3.7 | Haiku | 3.4 + 3.6 | New test files only — conflicts with nothing, can run alongside anything |

E and F run concurrently **only** under the barrel-file rule above; their handler files are
disjoint and the registry conflict is one line each. If either batch discovers a missing engine
mechanism, that is 4.1b's definition-of-done failing — stop and fix it in one lane, don't patch
`pump.ts` from two lanes at once. **Engine files have exactly one owner per wave.**

### Wave 3 — convergence (2 agents, then 1)

| Lane | Tasks | Model | Needs |
|---|---|---|---|
| **H — skill tests** | 4.5 | Haiku | 4.2–4.4 done. New files only; runs alongside I |
| **I — audit** | 5.4 anti-cheat audit | Opus/Fable | Phase 4 landed (see note above). Read-mostly; if it patches `playerView` it is the only engine writer left |

Then single-threaded: **7.2 playtest** (needs everything; log each edge case as a test before
fixing it).

## Critical path

3.4 → 国色/4.4 → Opus review → 4.5 → 7.2, with 5.4 slotting in parallel to 4.5.
So **Lane A is the long pole — staff it first.** Everything else has slack: 3.5/3.6, 4.2, 4.3 and
15 of 4.4's 16 skills can all be in flight before 3.4 finishes.

## Per-agent checklist (unchanged, the short version)

1. Read `CONTINUE.md` first; check the ◀ row in `build-breakdown.md` for your task.
2. Verify `autosnapshot.bat` is running; `snapshot.bat <task> start` before you begin.
3. Surgical `Edit`s on shared files; heredoc only files you created; re-read before every write.
4. Build/test in one reused `/tmp` scratch (`rm -rf` first), verify via `run-tests.bat` on Windows.
5. Write `docs/handoff/<task>.md` (esp. locale keys + shared-file edits); update the breakdown
   row + one CONTINUE.md paragraph; `snapshot.bat <task> done`; delete your `/tmp` scratch.
