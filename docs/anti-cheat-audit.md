# Anti-cheat audit — task 5.4 (written 2026-07-12, Wave 3 Lane I)

Audits what the server sends to a browser, and what it accepts back. Deliberately run **last**
(`docs/finish-workflow-plan.md`): it formally only covers 5.1–5.3, but Phase 4 added the last
hidden-information surfaces worth auditing — 观星 sees the draw pile, 反间/遗计/突袭/反馈 move
hidden cards between hands, and `confirmSkill` could in principle disclose what a player *could*
answer. Auditing before Batch C landed would have meant auditing twice.

**Threat model: a modified client.** Not a bug-hunt — the assumption is a player who has opened
devtools, is reading every websocket frame in full, and is dispatching hand-crafted moves. The two
questions are therefore: **what did we send them**, and **what will we accept from them?**

**Verdict: one real leak, found and fixed. The move-side trust boundary is sound as it stands.**

---

## 1. The rule being enforced

engine-design §6: **delete hidden zones, never mask them.** A masked card is still a card id on the
wire, and the wire is where a cheating client reads. Anything a player is not entitled to must be
*absent* from the object `playerView` returns — not zeroed, not shuffled, not obfuscated.

`playerView` was **extracted from `bgio/game.ts` into `bgio/playerView.ts`** by this audit. Behaviour
unchanged (`ThreeKingdomsGame.playerView` still points at the same function; there is exactly one
definition of it in the tree). The reason is that a boundary this important should be a file you can
open, grep and test on its own, rather than eighty lines in the middle of the move handlers — and
`server/test/bgio/playerView.test.ts` is now the regression suite that attacks it.

## 2. The finding — G.log named a card that came out of a hidden hand

**Severity: real, exploitable, and it would never have shown up in a playtest.** `G.log` is the one
channel content writes to that `playerView` forwards **whole, to every client**. Two skills put a
card id into it for a card lifted out of a hidden **hand**:

| Site | What it logged | What the table is entitled to know |
|---|---|---|
| `content/skills/fankui.ts` (反馈) | `log.card_taken` with `card: <the taken card>` | 司马懿 takes a card from his attacker. Nobody else sees which. |
| `content/skills/tuxi.ts` (突袭) | same | 张辽 takes a card from up to two players. Nobody else sees which. |

Every other client could read the id straight out of the log — so a passive observer learned a card
in another player's hand, which is the single most valuable secret in the game. (Both skills can also
take from **equipment** or the **judgement zone**; those cards were already face up, and naming them
is correct.)

**Fix (both files):** branch on the zone the card actually came out of.

- from a hand → `log.card_taken_hidden`, `{player, target}` — the event, not the card.
- from equipment / judgement zone → `log.card_taken` as before, `{player, target, card}`.

New locale key `log.card_taken_hidden` in **both** locale files (en: "{{player}} takes a card from
{{target}}'s hand"; zh: "{{player}} 获得了 {{target}} 的一张手牌"), added to `client/src/game/log.ts`'s
`LOG_KEYS`.

**The invariant this establishes, and the one to hold the line on:**
> **A `G.log` entry may only name a card that is already face up.** If a card moved hand → hand, log
> the *event*, not the card.

Pinned in three places so a future skill can't quietly break it: `playerView.test.ts`'s log tests,
`fankui.test.ts`/`tuxi.test.ts` (both directions — hand ⇒ no card id, equipment ⇒ card id), and the
comment on `{t:'log'}` in `frames.ts`'s Frame union.

### Related, NOT fixed (not a leak — a missing log line)

`content/effects/takeOneCard.ts` (顺手牵羊 / 过河拆桥) logs **nothing at all**, so it leaks nothing —
but it is also the one card-moving effect with no `G.log` entry, which is an F3 gap, not a 5.4 one.
Whoever closes it should use `log.card_taken_hidden` for the 顺手牵羊 hand case, which now exists.

## 3. Everything else that was checked, and passed

| Surface | Sent to whom | Verdict |
|---|---|---|
| `G.drawPile` | nobody, ever (only `drawPileCount`) | ✅ deleted. Its *order* is the game's biggest secret — 观星 exists to peek at it. |
| `G.stack` | nobody | ✅ deleted. Frames carry card ids in their ctx (the resolved `chosen` card, 遗计's drawn ids). |
| other players' `hand` | nobody (only `handCount`) | ✅ stripped. |
| own `hand` | you | ✅ correct. |
| `role` | only when `roleRevealed` | ✅ 5.3's one-flag reveal holds; nothing else carries a role. |
| `PlayerState.flags` | only `pub.*` keys to others | ✅ F2's fix holds. `flags` is still empty through Phase 4. |
| `G.turnFlags` | everyone | ✅ **re-checked every key written by 3.x/4.x** (`strikeUsedInAction`, `luoyi`, `rende.given`/`healed`, `ganglie.pendingSource`, `tieji.forceHit`, `liuli.redirectTo`, the 青龙偃月刀 counter, the activeLimit keys): all are booleans, counters or player ids. **No turn flag carries a card id**, and none should. |
| `G.pending` | full payload to `pending.playerId`; `{kind, waitingOn}` to everyone else | ✅ and this is load-bearing: 观星's private reveal of the top of the draw pile rides in exactly this channel (skill-trigger-design §6), as does 遗计's list of its own two drawn cards. |
| `chooseCard`'s `choices` | the asker | ✅ **opaque hand SLOTS, never ids** (3.1 §5). The attacker learns nothing from the payload — which is the point, and is why 反馈/突袭/顺手牵羊 could never have leaked *through the request*. They leaked through the log instead. |
| `G.judgement` · `G.damage` · `G.demand` · `G.revealed` · `G.discardPile` | everyone | ✅ **deliberately public, each confirmed against the rules**: a flipped judgement card is face up (and 鬼才 is only playable *because* its owner can see it), a 杀 landing is not a secret, everyone can see that 张三 is being asked for a 闪, and 五谷丰登's pool is on the table. |
| `G.selection` | never raw — `selectionView` rebuilds it | ✅ your own candidates only; other players' picks are a *fact* (`lockedIn`), not a choice, until the window closes; the Lord's pick is public because they pick in the open. |
| spectator / master view (`playerID === null`) | the public projection | ✅ same stripping — `id === playerID` never matches, so no hand, no role, no pending payload. |

## 4. The move side — what we accept back

Checked all 14 moves in `bgio/game.ts`. **No leak, and no trust of client-supplied state.** The
pattern is uniform and correct: every move first asserts `G.pending` exists, is of *its own* kind,
and names *this* `playerID` — so a player cannot answer a request that isn't theirs, and cannot
answer one that isn't open. Then it re-validates the payload against **live server state**:

- `playCard` / `useSkill` / `supplyCards` / `submitRetrial` / `redirectStrike` — every card id must
  be in **that player's own hand** (`hand.includes`), and `getCard` is wrapped in try/catch so a
  fabricated id is `INVALID_MOVE`, not a crash. `cardsAs` (the 视为 fold) is what decides whether a
  claimed conversion is legal — the server decides, never the client.
- `chooseCard` — the answer is a SLOT, mapped back through `resolveSlot` **against live state**, so a
  hand-crafted `{z:'hand', index: 99}` or an unworn piece of equipment is `INVALID_MOVE` rather than
  a leak. Nothing can have moved underneath it: the engine was blocked on `G.pending` the whole time.
- `chooseOption` / `choosePlayer` / `orderTriggers` / `arrangeCards` / `distributeCards` /
  `declareSuit` — each answer must be drawn from the set the server itself offered (`options`,
  `candidates`, `triggerIds`, `cards`), with duplicate and length checks. `arrangeCards` (观星)
  additionally re-derives nothing from the client: the re-ordering must be a permutation of exactly
  the offered ids.
- `chooseGeneral` — `applyPick` does every check itself and **applies nothing if any of them fail**;
  an illegal move must not half-apply.

The one thing worth stating explicitly, because it is what makes the above sound: **no move ever reads
a card id out of the client's payload and moves it without first finding that id in the zone the rules
say it must be in.**

## 5. Guard rails for whoever adds the next skill / request kind

1. **`PendingRequest` is an open bag** (`[k: string]: unknown`) and its payload goes to one player in
   full. That is a *feature* (观星), and it is also the easiest way to introduce a leak: put the wrong
   thing in a payload and it ships. Rule: **everything in a request payload must be something that
   one player is entitled to know.**
2. **`confirmSkill` discloses the `ev` (TriggerEvent) to the trigger's owner** — and a `card.lost`
   event names the ids that left a hand. Safe **today** because every optional trigger in the Standard
   40 is self-scoped (you only ever confirm a trigger about your own cards). **A future skill that
   listens to another player's `card.lost` would leak their discarded hand ids through this payload.**
   That is the next leak this codebase will have, if it has one.
3. **The public log is the other easy leak** — see §2's invariant.
4. **`G.turnFlags` is public.** Never put a card id in a turn flag.
5. Anything that becomes *public knowledge mid-game* (a revealed card, a judgement) is fine to name —
   the test is not "is it secret now" but "was the player who learns it entitled to learn it".

## 6. Verification

`server/test/bgio/playerView.test.ts` — **15 new tests, all green** in an isolated scratch build,
alongside the 40 skill-test files from 4.5 (41 files / 239 tests total in that run). Each test is an
*attack*: it takes the exact object one player's browser receives and greps the serialised JSON for a
secret (`expect(serialisedFor(G, '0')).not.toContain('strike_2c')`). The blunt-instrument approach is
deliberate — it catches a leak through a field nobody thought to test, which is precisely how §2's
finding was caught in the first place.

⚠️ The scratch build is not a typecheck (vitest transpiles with esbuild). **`run-tests.bat` on Windows
is the gate**, and it also runs the two tests that this session's sandbox could not: `content.test.ts`
(locale parity — one key was added to both files) and `client/test/i18n.test.ts` (every `LOG_KEYS`
entry resolves in both locales).
