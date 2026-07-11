# `docs/handoff/` — one file per task, written by whoever did the task

**Why this folder exists.** Four agents work this tree concurrently, one per phase, with no version
control. Two things have already been observed, and both will happen again:

1. **A shared file gets overwritten from a stale snapshot.** An agent reads `locales/en.json`, works for
   twenty minutes, writes it back — and silently deletes every key another agent added in the meantime.
   This has already cost 3.3's seven prompt keys and 5.x's `log.kill_reward`/`log.kill_penalty`, in one
   save, twice.
2. **A shared file gets *merged* correctly by luck** (3.3's `chooseCard` stage and 5.3's `endIf` both
   survived in `bgio/game.ts`) — which is not a plan.

You cannot fix this by being careful. You fix it by making every edit to a shared file **re-appliable**.

## The rule

When a task edits a file it does not exclusively own, it also writes
**`docs/handoff/<task>-<name>.md`** — a file nobody else will ever touch — containing the exact hunks it
added, verbatim, in a form someone can paste back in.

So each task produces:

* its **own new files** (safe — nobody else is writing them), and
* its **edits to shared files** (unsafe — may be clobbered), and
* **a handoff note recording those edits** (safe, because the filename is unique to the task).

If a shared edit disappears, you don't re-derive it from the design docs. You open the handoff note and
paste it back.

## Shared files — the ones that need a handoff note

Ranked by how often several tracks touch them:

| File | Why everyone lands here |
|---|---|
| `locales/en.json` · `locales/zh.json` | every card, skill, prompt and log line adds keys. **The single worst file** — a whole-file JSON rewrite is the default way an agent edits it, and that's exactly the destructive move |
| `CONTINUE.md` | every task updates status. Keep edits to **one paragraph / one row** you own |
| `docs/build-breakdown.md` | the Status column. Same rule: your row only |
| `server/src/bgio/game.ts` | stages and moves (3.x adds request kinds, 5.x adds `endIf`, 4.1b retires two stages) |
| `server/src/content/effectRegistry.ts` | one line per card |
| `shared/src/threeKingdoms.ts` | `THREE_KINGDOMS_STAGE_MOVES` — a new stage must be added here or the client silently never sends the move |
| `server/src/engine/state.ts` · `frames.ts` | new public fields / frame types |

## How to edit a shared file without destroying someone's work

* **Edit in place — never rewrite the whole file.** Anchor on a nearby line and insert. Do not
  `json.load` → mutate → `json.dump` a locale file; that reformats and reorders 250 keys and makes the
  clobber invisible.
* **Re-read immediately before you write.** Not at the start of your session — a shared file *will* have
  moved under you while you were working.
* **After writing, grep for the other tracks' markers**, not just your own. If `log.kill_reward` was
  there this morning and isn't now, you deleted it.
* **Then write your handoff note.**

## Reading order for a new session

`CONTINUE.md` → `docs/build-breakdown.md` (Status column is the source of truth) → the handoff note of
any task whose code you're about to touch.
