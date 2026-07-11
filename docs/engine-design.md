# Engine Design — Core Rules Engine (task 2.1)

**Status: approved design. Tasks 2.2–2.8 implement this; don't redesign it mid-phase.**
Model: Opus-tier decision doc. Everything below is a *decision*, not a suggestion — where a
real alternative was rejected, the reason is given so it doesn't get relitigated.

Prereq reading: [`three-kingdoms-plan.md`](three-kingdoms-plan.md) §2 (ruleset) and §5 (architecture),
[`build-breakdown.md`](build-breakdown.md) Phase 2.

---

## 0. The one insight this document exists to deliver

**A card play is not an atomic state transition.** Playing one 杀 can expand into:

> 杀 → target may play 闪 → target has 八卦阵, so a *judgement* flips a card → judgement result may
> itself be re-flipped by a skill (鬼才) → 闪 succeeded → attacker has 青龙偃月刀, so an *immediate second*
> 杀 is offered → damage lands → target drops to 0 → a **dying window** opens in which *any* player,
> in seat order, may play 桃 → nobody does → target dies → the killer's 奸雄/rewards trigger.

That single move requires input from **at least three different players, in an order not known when
the move started**, with nested sub-decisions. boardgame.io moves are *synchronous reducers* — a move
cannot `await` another player's answer. Any design that tries to resolve a card inside one move
function collapses the moment 无懈可击 (recursive) or 濒死 (out-of-turn, any player) shows up.

So: **the engine is a stack machine that is driven forward by moves, not a set of moves that
implement rules.** Moves do exactly one thing — supply the answer the stack is currently blocked on —
then hand control back to the engine loop. Everything in §2–§5 follows from this.

---

## 1. State shape (`G`)

Lives in `server/src/engine/state.ts`. Serialisable, no class instances, no functions, no `Date.now()`,
no `Math.random()` — boardgame.io must be able to snapshot, diff, and (later) replay it.

```ts
type CardId   = string;          // "strike_2c" — matches content/standard/cards.json .id
type PlayerId = string;          // boardgame.io playerID, "0".."7"

interface GState {
  // ── hidden zones (stripped by playerView) ───────────────────────────
  drawPile:    CardId[];         // index 0 = top. NEVER sent to any client.
  discardPile: CardId[];         // public; top card matters for a few effects

  // ── players ─────────────────────────────────────────────────────────
  players: Record<PlayerId, PlayerState>;
  seats:   PlayerId[];           // seat order, index = seat number. Dead players stay
                                 // in the array (distance is measured over living seats only)

  // ── turn ────────────────────────────────────────────────────────────
  activeSeat:  number;
  turnPhase:   TurnPhase;        // 'prep'|'judge'|'draw'|'action'|'discard'|'end'
  skipPhases:  TurnPhase[];      // set by 乐不思蜀 etc., cleared at end of turn
  turnFlags: {
    strikesPlayed: number;
    strikeLimit:   number;       // 1 by default; Infinity with 诸葛连弩
    [k: string]:   unknown;      // skill-scoped, cleared each turn
  };

  // ── resolution ──────────────────────────────────────────────────────
  stack:   Frame[];              // LIFO. stack[stack.length-1] is what runs next.
  pending: PendingRequest | null;// non-null ⇔ engine is blocked on a player's answer
  log:     LogEntry[];           // { key: 'log.plays_strike', params: {...} } — i18n keys, never text

  gameOver?: { winners: PlayerId[]; condition: Role };
}

interface PlayerState {
  id: PlayerId;
  seat: number;
  role: Role;                    // 'lord'|'loyalist'|'rebel'|'traitor' — hidden unless revealed
  roleRevealed: boolean;         // lord = true from setup; others flip true on death
  generalId: string;             // content/standard/generals.json .id
  maxHp: number;                 // general.maxHp (+1 if lord)
  hp: number;
  alive: boolean;
  hand: CardId[];                // stripped → handCount for everyone else
  equipment: {                   // the 4 slots
    weapon:     CardId | null;
    armour:     CardId | null;
    plusHorse:  CardId | null;
    minusHorse: CardId | null;
  };
  judgementZone: CardId[];       // delayed tricks. Resolution order is LIFO —
                                 // the most recently placed card judges FIRST (see §4).
  flags: Record<string, unknown>;// skill state, e.g. { 'guanyu.wusheng': true }
}
```

### Card *data* is not in `G`

`G` stores **only card ids**. Suit, rank, type, `effectKey` come from an immutable `CardIndex`
built once from `content/standard/cards.json` at server boot (`engine/cardIndex.ts`,
`getCard(id): CardDef`). Two reasons, both load-bearing:

1. `G` stays small and diff-friendly (boardgame.io ships state deltas over the socket every action).
2. It makes the hidden-information boundary crisp: **an id a client can see is a card it may see.**
   Because ids encode suit/rank (`strike_2c`), the drawPile array must be *deleted*, not masked —
   see §6.

### 🔴 Blocking data gap — `cards.json` must be migrated before 2.2

The Phase 1 schema is `{ id, zhName, enName, type, suit, rank, position, equipmentType?, horseDirection? }`.
The engine cannot dispatch on that. **Task 2.2 starts by adding two fields** (Haiku-tier transcription,
~20 min, mechanical — the values are all in plan §3.2/§3.3):

| Field | Applies to | Value |
|---|---|---|
| `effectKey` | every card | `"strike"`, `"dodge"`, `"peach"`, `"dismantle"`, `"nullification"`, `"zhuge_crossbow"`, `"eight_trigrams"`, `"plus_horse"` … one key per *card name*, shared by all copies |
| `range` | weapons only | 1 (诸葛连弩) · 2 (雌雄双股剑/青釭剑/寒冰剑) · 3 (贯石斧/青龙偃月刀/丈八蛇矛) · 4 (方天画戟) · 5 (麒麟弓) |

(Counts to check the migration against: 107 cards, 10 weapon *cards* = 9 distinct weapons + a second
诸葛连弩 copy. Both copies get the same `effectKey` and `range`.)

Do **not** derive `effectKey` from `enName` at runtime — a typo in a display string would silently
change game logic, and it breaks the "content is data" contract the moment a translation changes.

---

## 2. The resolution stack

`Frame` is a closed discriminated union. A frame is a *unit of work the engine owes the game*.

```ts
type Frame =
  | { t: 'phase';     phase: TurnPhase }                         // run one of the 6 phases
  | { t: 'play';      source: PlayerId; cards: CardId[]; targets: PlayerId[]; effectKey: string }
  | { t: 'effect';    effectKey: string; ctx: EffectCtx }        // one step of a card/skill effect
  | { t: 'request';   req: PendingRequest }                      // block on a player's answer
  | { t: 'damage';    source: PlayerId | null; target: PlayerId;
                      amount: number; kind: 'normal'|'fire'|'thunder'; card?: CardId }
  | { t: 'judge';     target: PlayerId; reasonKey: string;
                      onResult: string /* effectKey */; card?: CardId }
  | { t: 'dying';     target: PlayerId; asker: PlayerId; offset: number } // §5
  | { t: 'trigger';   event: EngineEvent; payload: unknown }     // fan out to listeners
  | { t: 'resume';    effectKey: string; ctx: EffectCtx };       // continuation after a request
```

### The pump

```ts
// engine/pump.ts — the whole engine in one loop
function pump(G: GState, rng: RNG): void {
  while (!G.pending && G.stack.length && !G.gameOver) {
    const frame = G.stack.pop()!;
    // resolve() is PURE-ish: it mutates G, and may push new frames or set G.pending.
    resolve(frame, G, rng);
  }
}
```

That's it. `resolve()` dispatches on `frame.t`, and for `'effect'` dispatches again through the
**effect registry** (§3). A frame that needs a player decision does two things: sets `G.pending`, and
pushes a `{t:'resume'}` frame holding everything it needs to carry on. The loop then exits; the
socket goes quiet; the human thinks; a move arrives; the move validates the answer, writes it into
the resume frame's `ctx`, clears `G.pending`, and calls `pump()` again.

**Moves are three lines.** They never contain rules:

```ts
moves: {
  respond: ({ G, playerID, random }, answer: Answer) => {
    if (!isValidAnswer(G, playerID, answer)) return INVALID_MOVE;  // server-side, always
    applyAnswer(G, playerID, answer);   // writes into the top 'resume' frame's ctx
    G.pending = null;
    pump(G, rngFrom(random));
  },
  playCard: (...)   // action phase only: pushes a {t:'play'} frame, then pump()
  endPhase: (...)   // pushes the next {t:'phase'} frame, then pump()
}
```

Because *every* interrupt is "push a request frame", the hard cases stop being special:

| Rules situation | Stack expression |
|---|---|
| 杀 → 闪 | `play(strike)` pushes `request(dodge, target)`; no 闪 → pushes `damage` |
| 无懈可击 chain | the nullify request, on being answered "yes", pushes *another* nullify request to the next eligible player. Recursion for free; parity of the chain decides the outcome |
| 濒死 → 桃 from anyone | `dying` frame re-pushes itself with `offset+1` (§5) |
| 青龙偃月刀 (re-strike on dodge) | its trigger returns a fresh `play(strike)` frame |
| 八卦阵 | the dodge request's handler pushes a `judge` frame whose `onResult` can synthesise a 闪 |

No `await`. No re-entrancy. No hidden control flow.

### Why not the obvious alternatives

- **Resolve a card inside one move (a big `switch`).** Impossible: the move would have to block on
  another player. Rejected on physics, not taste.
- **`async` moves / promises.** boardgame.io reducers must be synchronous and deterministic
  (they're re-run on the client for optimistic updates and on the server for authority). A promise
  in a reducer breaks both.
- **An external state machine library (XState).** Adds a second source of truth beside `G`, and its
  state has to be serialised into `G` anyway to survive reconnect. The stack *is* the machine, and
  it's 40 lines.

---

## 3. Registry dispatch (`effectKey`)

Content is data; the engine is generic. `content/standard/effects/` exports one module per effect,
all collected into a registry keyed exactly by `cards.json.effectKey`.

```ts
interface CardEffect {
  key: string;
  targeting: TargetSpec;                     // declarative — the UI reads this too, so
                                             // "who can I click?" is never coded twice
  canPlay(G: GState, self: PlayerId): boolean;      // 桃: only when hp < maxHp. 杀: strikesPlayed < strikeLimit
  resolve(G: GState, ctx: EffectCtx): Frame[];      // returns frames — NEVER mutates G directly
}

interface TargetSpec {
  min: number; max: number | 'all_others' | 'all';
  self: 'allowed' | 'forbidden' | 'only';
  inRange?: 'attack' | 'distance_1';         // 杀 uses attack range; 顺手牵羊 uses distance ≤ 1
  predicate?: (G, self, candidate) => boolean;
}

export const effectRegistry: Record<string, CardEffect> = { strike, dodge, peach, ... };
export const skillRegistry: Record<string, Skill> = { /* Phase 4 */ };
```

**`resolve()` returns frames rather than mutating `G`.** This is the rule that keeps Phase 3 and
Phase 4 from turning into spaghetti: an effect can't "reach into" the resolution of another effect,
it can only schedule work. It also makes every effect trivially unit-testable (call it, assert on
the returned frame array) — which is exactly what task 2.7 needs.

Equipment effects are *not* `CardEffect`s. Equipping is the effect (`resolve` → move card to slot,
discarding whatever it replaces); the weapon's *behaviour* is a set of **triggers** (§4) registered
under the same key. Same for armour. Horses are pure data, read by the distance function (§7).

---

## 4. Event / trigger model

```ts
type EngineEvent =
  | 'turn.start' | 'turn.end'
  | 'phase.start' | 'phase.end'                       // payload carries which phase
  | 'card.play'   | 'card.lost'   | 'card.gained'
  | 'damage.before' | 'damage.after' | 'heal.after'
  | 'dodge.used'  | 'dodge.missing'                   // 'missing' = "you need a 闪 and have none" (八卦阵 hooks here)
  | 'judge.card'  | 'judge.result'                    // 'card' fires BEFORE the result is read (鬼才 retrial)
  | 'hp.change'   | 'dying' | 'death'
  | 'strike.hit'  | 'strike.dodged';

interface Trigger {
  id: string;                                  // 'equip.qinglong' | 'skill.jianxiong'
  event: EngineEvent;
  optional: boolean;                           // optional ⇒ engine pushes a yes/no request first
  priority: number;                            // 100 equipment · 200 skills · lower runs first
  when(e, G, owner: PlayerId): boolean;
  effect(e, G, owner: PlayerId): Frame[];      // same contract as CardEffect.resolve: return, don't mutate
}
```

Three decisions here, all deliberate:

**1. Listeners are *derived*, never subscribed.** On each `{t:'trigger'}` frame the engine walks all
living players, reads their current equipment slots and their general's `skillIds`, looks each up in
the registries, and keeps the triggers matching this event whose `when()` passes. There is no
subscription table to keep in sync. This is not a performance question — it's a correctness one:
equipment gets stolen and destroyed *mid-resolution* (过河拆桥 lands while a 杀 is unresolved), and a
subscription list would go stale exactly when it matters. **Always read live state.**
(Concrete case: 青釭剑 "ignores armour" is evaluated at `damage.before` — if the sword was discarded
one frame earlier, the armour is back on.)

**2. Simultaneous triggers resolve in a fixed order.** Sort by `priority`, then by **seat order
starting from the current turn player** (the standard 三国杀 tiebreak: 由当前回合角色开始, 按座位顺序).
If one player owns several triggers on the same event, *that player* chooses the order — which is
just another `request`. Push the sorted list onto the stack in reverse so the first one runs first.
This is fully deterministic, which is what makes 2.7's tests and any future replay possible.

**3. Optional triggers cost a request, so mark them honestly.** A mandatory trigger runs silently; an
optional one blocks the game on a yes/no prompt. Getting this wrong is the difference between a
smooth game and one that asks "use 奸雄?" eleven times a turn.

---

## 5. The two interrupts everyone gets wrong

### Dying window (濒死) — the reason `dying` is its own frame type

At hp ≤ 0 the engine pushes `{t:'dying', target, asker: target, offset: 0}`. Resolving it:

1. If `target.hp > 0` → drop the frame; they were saved. (Re-checked *every* iteration — a 桃 played
   two frames ago must end the window immediately.)
2. `asker = seats[(seatOf(target) + offset) % n]`, skipping the dead. **Starts with the dying player
   themselves** and proceeds clockwise — this ordering is a rule, not an implementation detail.
3. If `asker` holds a 桃 (or has a save skill), push `request(peach, asker)` and re-push
   `{t:'dying', …, offset}` *underneath* it. Answer "no" → re-push with `offset+1`.
4. `offset` wraps back to the dying player → nobody saved them → push `{t:'effect', 'death'}`.

Death resolution: reveal role, move hand+equipment+judgement zone to discard, check win conditions,
apply the killer's reward/penalty (Lord kills a Loyalist → Lord discards all cards; killing a Rebel →
draw 3). **A death mid-resolution does not cancel the rest of the stack** — an AoE that kills player 3
still hits players 4 and 5. Only the *frames targeting the dead player* are dropped, and the engine
does that by checking `alive` when a frame is popped, not by scrubbing the stack.

### Nullification chain (无懈可击)

A cancellable effect pushes `request(nullify)` before its own resolution, offered to every player
holding 无懈可击 (server knows; asked in seat order from the turn player). Each "yes" pushes another
`request(nullify)` for the *next* eligible player. When the chain finally closes, count it: an **odd**
number of nullifications cancels the effect, an **even** number lets it through. Detailed timing
(what exactly is "the effect", per-target vs whole-card for AoEs) is **task 3.1's** problem, not
Phase 2's — the stack just has to make it expressible, and it does. Phase 2 ships `nullification` as
a registered-but-unimplemented key.

---

## 6. `playerView` — the anti-cheat contract

boardgame.io applies `playerView` **on the master before transmitting**, so it is a real boundary,
not cosmetic. Phase 5.4 audits it; Phase 2 must not build anything that needs to violate it.

| Field | What player `p` receives |
|---|---|
| `drawPile` | **deleted**, replaced by `drawPileCount: number` |
| `discardPile` | full (public) |
| `players[p].hand` | full |
| `players[other].hand` | **deleted**, replaced by `handCount: number` |
| `players[x].role` | only if `roleRevealed` (lord: always) — otherwise deleted |
| `players[x].flags` | only public flags (prefix convention: `pub.*` is sent, everything else isn't) |
| `pending` | only if `pending.playerId === p`; others get `{ waitingOn, kind }` |
| `stack` | **deleted entirely.** The client renders from `log` + `pending`, never from the stack |

Card ids leak suit and rank by construction (`strike_2c`). That's correct for cards you can see and
fatal for cards you can't, so masking (`"???"`) is banned — the fields are **deleted**. If a future
feature needs "show the deck top to one player", it goes through a per-player reveal field, not a
softened `drawPile`.

**Corollary for the client:** the client cannot pre-validate anything it lacks the state for. Every
move re-validates server-side and returns `INVALID_MOVE`; the client's checks are UX, never authority.

---

## 7. Small pieces, pinned down

**Distance & range** (task 2.5 — pure function, no state):
```
seatDistance(a,b) = min(clockwiseLivingSteps(a,b), clockwiseLivingSteps(b,a))   // dead seats don't count
distance(from,to) = seatDistance(from,to) − (from has −1 horse ? 1 : 0) + (to has +1 horse ? 1 : 0)
                    clamped to a minimum of 1
attackRange(p)    = weapon ? weaponRange(weapon) : 1
inAttackRange(a,b)= distance(a,b) ≤ attackRange(a)
```
Note the asymmetry — `distance(a,b) ≠ distance(b,a)` when horses are involved. That is the rule, not a bug.

**Deck** (2.2): shuffle via boardgame.io's `random` plugin only (seeded, server-side, replayable —
`Math.random()` anywhere in the engine is a bug). Draw pops from index 0. When the draw pile empties
mid-draw, shuffle the discard pile into it and continue; cards in hands, equipment slots and
judgement zones are *in play* and are not recycled. If both piles are empty the game is a draw
(vanishingly rare; handle it, don't crash).

**Turn phases** (2.3): the 6 phases are **`G.turnPhase` + `{t:'phase'}` frames, NOT boardgame.io
`phases`.** boardgame.io phases contain many turns; here each turn contains six sub-phases — the
nesting is inverted, so the framework's phase system is the wrong tool and fighting it costs a week.
Use boardgame.io for exactly two things: `turn` (= one 回合) and **`stages` / `activePlayers`**, which
are set from `G.pending` on every pump (`events.setActivePlayers({ value: { [pending.playerId]: pending.kind } })`).
Reserve framework-level `phases` for `setup` (role deal + general select, task 5.2) and `play`.
`skipPhases` is checked by the phase advance, and is how 乐不思蜀 skips the action phase.

Two boardgame.io facts the adapter must respect (verified against the framework docs):
- **A stage's `moves` block fully overrides the global `moves` block** for players in that stage. So
  define one stage per `PendingRequest.kind` (`respondDodge`, `respondPeach`, `respondNullify`,
  `chooseCards`, `act`, `discard`), each exposing only the move that is legal there. This gives a
  second, framework-level guard on top of `isValidAnswer()` — belt and braces, both server-side.
- **`ctx.activePlayers` is `null`** whenever nobody is in a stage. Always guard
  (`playerID in (ctx.activePlayers || {})`), never dereference it directly.

**Hand limit** (2.2): discard phase pushes a request for `hand.length − hp` cards. Hand limit is
*current* HP, not max.

---

## 8. Module layout (and the workspace fix 2.2 must do first)

```
server/src/
  engine/          state.ts  frames.ts  pump.ts  triggers.ts  distance.ts  deck.ts  cardIndex.ts
  content/         → re-exports registries from /content/standard
  bgio/            game.ts   ← thin boardgame.io adapter: setup(), moves{}, playerView(), turn.stages
```

**`engine/` must not import `boardgame.io`.** It's a plain TS module operating on `GState` + an `RNG`
interface. The adapter in `bgio/` is the only thing that knows the framework exists. This is what lets
2.7 unit-test the engine by constructing a `GState` and calling `pump()` — no server, no socket, no
mocks — and it's the escape hatch if boardgame.io ever chafes (plan §6's stated fallback to Colyseus
becomes a ~200-line adapter rewrite instead of a rewrite).

⚠️ **`server/tsconfig.json` sets `"rootDir": "./src"`.** The first time `engine/` imports
`content/standard/cards.json` or a `shared/` module from outside `src/`, `tsc` fails with *"is not
under rootDir"*. Make `shared/` a real workspace package imported **by name** (resolved through
`node_modules`), not a `../../` reach up the tree — that sidesteps `rootDir` entirely and is the
reason `shared/` is a workspace rather than a folder.

**Known blocker:** `client/src/game.ts` and `server/src/game.ts` are hand-duplicated today (the Phase 0
comment admits it and says "Phase 1 should fix this" — Phase 1 didn't). The client needs the *types*
and the `TargetSpec` data, not the engine. Add a third workspace `shared/` (root `package.json`
already uses npm workspaces, so this is a one-line change) exporting `types.ts` + the card/general
JSON, and have both sides import it. Do this in 2.2 before writing engine code, or every later task
pays the duplication tax.

---

## 9. What this design deliberately does *not* solve

Named so nobody assumes they're covered:

- **Judgement retrial (改判) ordering** with multiple retrial skills — 3.1/4.1.
- **Per-target vs whole-card nullification for AoEs** — 3.1.
- **拼点 (point duels)** — no Standard card needs it; the `CardIndex` has `rank`, so it's addable.
- **Chain reaction (铁索连环) / fire-thunder spread** — Battle expansion, out of scope (plan §1), but
  `damage.kind` is already carried on the frame so the hook exists.
- **Reconnection / spectators** — Phase 5.
- **AI / bot players** — not planned.

---

## 10. Handoff to 2.2

Implementation order, all Sonnet-tier unless noted:

1. **2.2a** (Haiku) Migrate `cards.json`: add `effectKey` to all 107 cards, `range` to the 9 weapons. Add `shared/` workspace.
2. **2.2b** `engine/state.ts`, `frames.ts`, `cardIndex.ts`, `deck.ts` — types + deck + draw + discard + reshuffle.
3. **2.3** `pump.ts` + the 6 `{t:'phase'}` frames + the boardgame.io adapter (`turn.stages` wired to `G.pending`).
4. **2.4** `effectRegistry`: `strike` / `dodge` / `peach` + the damage frame + strike limit.
5. **2.5** `distance.ts` (pure, testable in isolation — do it any time).
6. **2.6** `dying` frame + death resolution. **Opus review before merge** (per breakdown).
7. **2.7** (Haiku) Unit tests: construct `GState`, push frames, pump, assert. No server needed.
8. **2.8** Integration: 4 players, no-skill generals, a full game of 杀/闪/桃 to a win condition.

If any of these tasks finds itself wanting to add an `await`, a subscription table, or a rule inside a
move function — stop. That's the design breaking, and it means something in §2–§4 is wrong and needs
an Opus-tier revisit, not a workaround.
