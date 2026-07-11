# Version control — and how to un-clobber a file

Four agents write this tree concurrently with no coordination. Until now there was also no history, so
when one of them overwrote a shared file from a stale snapshot, the other's work was **gone** — not
conflicted, not flagged, gone. That has already happened twice to `locales/*.json`.

Git doesn't stop the clobbering. It makes it **visible and reversible**, which is all you actually need.

## Setup (once, on the Windows side)

| Script | What it does |
|---|---|
| `git-setup.bat` | `git init` + baseline commit. Run once. Safe while agents are working — it only reads your files and writes into `.git\`. |
| `snapshot.bat` | Commit whatever is on disk right now. No-op if nothing changed. `snapshot.bat 3.4 done` for a named restore point. |
| `autosnapshot.bat` | Leave it running in its own window: commits every 2 minutes, if anything changed. **This is the one that matters** — the clobbers happen while nobody is looking. |

These must run **natively on Windows**, not from an agent's sandbox: the sandbox reaches this folder over
a mount that returns stale, truncated content for recently-written files, and a repo built from that view
would have corrupt files as its baseline. Same reason `run-tests.bat` exists.

## Recovering from a clobber

**Symptom:** something that was there this morning isn't. A locale key. A registry entry. A whole stage in
`bgio/game.ts`. Nobody wrote a line of code to remove it, and no agent will admit to it — because none of
them did it on purpose; one of them just saved a file it had read twenty minutes earlier.

**1. Confirm it, and find where it died:**

```
git log --oneline -- locales/en.json          # every commit that touched the file
git log -p -S "choose.dismantle" -- locales/en.json
```

`-S` is the one to remember: it shows only the commits where that string *appeared or disappeared*. The
commit where it vanished is the clobber.

**2. Restore just that file, from just before the clobber:**

```
git checkout <commit-before> -- locales/en.json
```

Not `git revert`, not `git reset` — those would also undo the *legitimate* work in the same commit, which
is somebody else's afternoon. One file, one commit, nothing else moves.

**3. If the clobbering commit also added real work** (it usually does — an agent's own new keys sit right
next to the ones it deleted), don't check the file out wholesale. Diff it and re-add the missing lines by
hand:

```
git diff <commit-before> HEAD -- locales/en.json
```

**4. Then snapshot immediately**, so the fix itself is recorded: `snapshot.bat locale keys restored`.

## The belt to git's braces

Recovery still costs you the time it takes to notice. That's why every task also writes
[`docs/handoff/<task>.md`](handoff/README.md) with its shared-file edits verbatim — so re-applying a lost
hunk is a paste, not an archaeology expedition. Git tells you *what* was lost; the handoff note tells you
*what it was supposed to say*. Keep both.

## What is not committed

`.gitignore` already covers `node_modules/`, `dist/`, `*.log` (so `test-output.log` stays out), `.env*`,
and editor droppings. Nothing else is excluded — `content/standard/*.json` and `locales/*.json` are source
and **must** be tracked; they are the files most likely to be destroyed.
