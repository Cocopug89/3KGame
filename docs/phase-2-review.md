# Phase 2 review — Core engine (tasks 2.1–2.8)

Reviewed at the close of task 2.8, against [`engine-design.md`](engine-design.md) (the binding design,
output of 2.1), [`three-kingdoms-plan.md`](three-kingdoms-plan.md) §2–§3 (the ruleset), and
[`build-breakdown.md`](build-breakdown.md) Phase 2. Everything below was checked against the code and,
where it's a behavioural claim, reproduced in a test — not read off the task notes.

## Verdict

**Phase 2 is complete and sound. Ship it; open Phase 3.** All eight tasks are done, the engine matches
the approved design (including where it deliberately deviates, which is documented in-code), and 139
tests pass with a clean `tsc` build across all three workspaces.

The engine is playable end to end: 4 players, no-skill generals, 杀/闪/桃, damage, the dying window,
death, seat-skipping, hand limits, and a turn loop that survives all of it — driven through the real
boardgame.io framework, not a mock.

One finding (**F1**) is a genuine soft-lock that Phase 3 will hit on its first or second task. It is
**not reachable in Phase 2** (nothing in 杀/闪/桃 can damage the active player during their own turn),
which is why it isn't a Phase 2 bug — but it must be designed away in 3.1, not discovered in 3.4.

## What was verified

| Area | How |
|---|---|
| Turn loop, stages, `activePlayers` sync | Real `boardgame.io/client`, every step of hundreds of moves |
| 杀 → 闪 → damage / no-damage | Rigged-deal integration tests through the real framework |
| 濒死 window (self-save, decline, death) | Rigged-deal integration + 25 unit tests from 2.6 |
| Death bookkeeping (role reveal, cards to discard, seat skipped) | Integration test drives 30 further requests after a death |
| Card conservation (107, always) | Asserted after *every* move in every drive loop |
| No dead player is ever asked for anything | Asserted after every move |
| `engine/` has zero boardgame.io imports (§8) | grep — comments only |
| No `Math.random()` / `Date.now()` anywhere in `server/src` (§1) | grep — comments only |
| Rules constants | 4-card opening hand, draw 2, hand limit = *current* hp, Lord +1 maxHp, role counts 4–8, one 杀/turn, range 1 unarmed, ±1 horse asymmetry — all match plan §2/§3 |

## Findings

### F1 — 🔴 Blocking for Phase 3: an active player who dies during their own turn wedges the game

`pump()`'s `'request'` case sets `G.pending` unconditionally — it never checks that the player it's
about to block on is still alive. And `playCard` re-queues an `act` request *underneath* the play it
just pushed (correctly — that's what stops the action phase soft-locking after one card, see the
2.4 gotcha). Put those together with an effect that can damage its own source, and:

```
stack: [ …play frames…, request(act, '0') ]   →  '0' dies during their own play
                                              →  the act request pops
                                              →  G.pending = { kind:'act', playerId:'0' }   ← a dead player
                                              →  stack empty, nothing can ever push again
```

Reproduced directly against `pump()`: after the death, `G.pending` names the dead player and the stack
is empty. Nobody can move; nothing can advance. Permanent wedge.

Nothing in Phase 2 can reach it: 杀 only damages someone else, and 桃 only heals. Phase 3 reaches it
twice over:

- **决斗 (Duel, 3.4)** — the *source* takes the damage when they run out of 杀 first.
- **闪电 (Lightning, 3.4)** — damages the active player during their own judge phase; the phase frames
  for the rest of *their* turn (draw, action…) are already on the stack and will happily run for a
  corpse, ending in exactly the same pending-on-a-dead-player state.

Fixing it is a design decision, not a patch, which is why it belongs in **3.1** rather than being
hacked in now: the rule is "if the turn player dies, the turn ends immediately," but §5 also says a
death mid-resolution must *not* cancel the rest of the stack (an AoE that kills player 3 still hits
4 and 5). So "clear the stack and push `{t:'phase', phase:'end'}`" is right for the turn-scoped
frames and wrong for an in-flight AoE. 3.1 should decide how turn-scoped frames are distinguished
from effect-scoped ones (a marker on the frame? a separate turn stack? drop only frames whose
`playerId`/`source` is the dead player?) and pump should then drop requests for dead players as a
belt-and-braces backstop.

### F2 — 🟡 `playerView` doesn't implement §6's `pub.*` flag filter

§6 says `players[x].flags` is sent to other players *only* for keys prefixed `pub.`; `playerView`
currently spreads the whole `flags` object into the public view (`const { hand, role, ...restOfPlayer }`
keeps it). Harmless today — nothing writes `flags` in Phase 2, so it's always `{}` — but the moment
Phase 4's skills start storing state there, private skill state ships to every client. Fix it when
4.1 lands, and it's an explicit item for the 5.4 anti-cheat audit either way.

### F3 — 🟡 `G.log` is never written

The state carries `log: LogEntry[]` (i18n keys, never text) and §6 says *"the client renders from
`log` + `pending`, never from the stack."* Nothing pushes a single entry. That's fine while there's no
UI, but Phase 6 cannot build a game feed out of an empty array, and retrofitting log entries across
every effect later is exactly the kind of sweep that gets done half-heartedly. Cheapest path: decide
the entry shape now and have each `resolve()` case in `pump.ts` (plus each effect) push as it goes,
starting with Phase 3's tricks so they land logged rather than being back-filled.

### F4 — 🟡 The draw-game condition is detected but not acted on

`drawCards` correctly stops early when both piles are empty (§7: *"if both piles are empty the game is
a draw — vanishingly rare; handle it, don't crash"*). It doesn't crash, but nobody handles it either:
the player just draws fewer cards and play continues forever. Wire it into `G.gameOver` when win
conditions land in Phase 5.

### F5 — ⚪ `{t:'dying'}.asker` is vestigial

`pump()`'s `'dying'` case recomputes the asker from `askerAtOffset(G, target, offset)` every pop and
never reads `frame.asker`. The field is in the design (§5) and is faithfully populated by everything
that pushes the frame, but it's dead weight and mildly misleading — a reader could reasonably assume
it's authoritative. Either drop it, or start reading it (it's genuinely useful for a log entry: "asked
X for a 桃"), which folds naturally into F3.

### F6 — ⚪ `syncBgio` never clears `activePlayers`

It calls `setActivePlayers` only when `G.pending` is truthy, so if the engine ever comes to rest with
nothing pending (only reachable at game over, Phase 5), bgio keeps the last stage's `activePlayers`
and that player can still submit stage moves. Add an `else { events.endStage() }`-shaped clear when
`gameOver` is implemented.

### F7 — ⚪ Integration coverage is 4-player only

`initGame`'s role table is unit-tested for 4–8, but every bgio-level test runs at `numPlayers: 4`.
Distance/seat-skipping bugs at 5–8 seats (particularly with the dead-seat circle) wouldn't be caught.
Cheap to add a 6- or 8-player pass through the same drive loop; worth doing before Phase 6 puts real
players in seats.

### F8 — ⚪ `strikesPlayed` is incremented by the `playCard` move, not by the 杀 effect

Correct today, and deliberately so (the counter is generic move bookkeeping, not part of `resolve()`).
But 决斗 (3.4) and 激将/武圣-style skills (Phase 4) make players play a 杀 *outside* the action phase, and
those must **not** count against the once-per-turn limit. Since they won't go through `playCard`, the
current split happens to give the right answer — just don't "helpfully" move the counter into
`strike.resolve()` later, which would silently break it.

## Deliberate deferrals (all documented in-code, none are debt)

- `'judge'` and `'trigger'` frames throw a named "not implemented until task X" error rather than
  silently no-op'ing — 3.2 and 4.1 respectively.
- `nullification` is a registered `effectKey` with no handler; equipment cards are unplayable (no
  registry entries) until 3.5/3.6.
- Win conditions / `G.gameOver`, killer reward-and-penalty, and general *selection* are Phase 5.
- The dying window only offers 桃 from a hand; "or has a save skill" is Phase 4.
