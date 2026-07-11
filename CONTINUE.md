# Start here — continuation protocol

Read this file first in any new session before touching code or docs. It's the fast-orientation
layer; everything else is one link away.

## Where things stand right now

**Current phase:** Phase 3 — Tricks & equipment
**Last completed (content track):** **3.3 — simple instant tricks** (below). Before it, **3.2 — judgement + the 无懈可击
chain** (70 tests), whose five load-bearing facts a Phase 3/4 session must not re-derive:

1. **F1 is fixed.** `endTurnIfTurnPlayerDied()` (`engine/dying.ts`): when the turn player dies, filter the
   `{t:'phase'}` frames off the stack and `unshift` an end-phase frame at the **bottom** — so everything still in
   flight (an AoE owed to players 4 and 5, a nullification chain mid-argument) resolves *first*, and only then does
   the turn end. Backstopped by the **dead-subject rule** (`subjectOf()` in `pump.ts`): any frame whose player
   subject is dead drops when it pops. Both halves are needed. **决斗/闪电/苦肉 are now safe to write.**
2. **Judgement** — public `G.judgement`, `judge`/`judgeResult`/`retrial` frames, `drawTop()`. The retrial hole is a
   plain trigger fan-out, so 鬼才 (4.4) is an ordinary skill and touches none of this code.
3. **The trigger fan-out** (`engine/triggers.ts` + `content/triggerTypes.ts`/`triggerSources.ts`/
   `equipmentTriggerRegistry.ts`) — built to skill-trigger-design §3, *including* §3.3's two-part rule: **the
   snapshot fixes the ORDER; eligibility is re-derived at pop time** (owner alive · still owns the trigger · `when()`
   still true). Tested with a listener that rips the armour off a listener queued behind it in the same fan-out.
   3.6 registers weapons here — **do not invent a second trigger type.**
4. **Nullification is the parity model**, asked through **`{t:'demand'}` / `demandCard` / `supplyCards`** from day one
   (4.1 §5). So 4.1b *deletes* `respondDodge`/`respondPeach` and rewrites nothing. Chain tested to depth 3 (all three
   无懈可击 in one argument).
5. **The three primitives** — `moveCards` (hand/equip/judgementZone/discard/drawPile, auto-discarding a replaced
   equipment card), `draw`, `skipPhase`. Effects still never mutate `G` (engine-design §3).

**3.3 (simple instant tricks) is DONE — 过河拆桥 · 顺手牵羊 · 无中生有.** 37 new tests (280 server), clean build. Three
things a later session should not re-derive:

1. **The slot protocol is built and is `engine/cardChoice.ts`** (`CardSlot` · `cardChoicesFor` · `resolveSlot`) + the
   `chooseCard` stage in `bgio/game.ts`. A hand card is addressed by **index, never by id** (ids leak suit/rank —
   judgement-nullification-design §5), the index is the server's own `player.hand` order, and `resolveSlot` re-validates
   the answer against live state, so a hand-crafted slot is `INVALID_MOVE` rather than a leak. **4.4's 大乔/陆逊 reuse
   this — don't write a second one.**
2. **过河拆桥 and 顺手牵羊 are one effect** (`content/effects/takeOneCard.ts`), differing only in range and destination
   zone. Both re-check the victim *at pick time* (still alive? still holds a card?) — targeting proved that when the card
   was **played**, and the entire 无懈可击 chain runs in between. Any future "reach into another player's cards" effect
   inherits that hazard.
3. **All three leave `nullify` unset** and get their 无懈可击 window from the `type: 'trick'` default. Setting it
   explicitly would be noise; the tests pin the default instead.

**五谷丰登 was deferred into 3.4 (as 3.3's row always allowed), and not because it's fiddly.** It needs the `revealed`
zone, which `pump.ts` still throws on, and the reveal step must take N cards off the draw pile — which **has to be able
to reshuffle the discard pile in, and that needs the `rng`**, which `CardEffect.resolve()` doesn't have and can't have
(engine-design §3: effects never mutate `G`). So its setup frame *cannot* be a plain `{t:'moveCards', from:{z:'drawPile'}}`
with ids read out of `G.drawPile`. 3.4 has to **decide**: a 4th primitive (`{t:'reveal', count}`, resolved in pump where
the rng lives) or a `count`-carrying `moveCards`. That's a design call, so it belongs with the other complex tricks.

**3.4 — complex tricks (+ 3.3b's 五谷丰登, + the standing U1/F3 items) is DONE.** 决斗/借刀杀人/南蛮入侵/万箭齐发/
桃园结义/乐不思蜀/闪电/五谷丰登 all implemented and registered; every one of them rides the existing
`{t:'demand'}`/`chooseCard` machinery from 3.2/3.3/4.1b — no new demand kind, no new bgio stage or move. Three
things a later session should not re-derive: (1) **the reveal primitive is `{t:'reveal', count}`**, a 4th
primitive resolved in `pump.ts` where the `rng` lives, chosen over a `count`-carrying `moveCards` because
`moveCards` always names the exact ids it moves and a reveal can't know those in advance without touching `G`
(engine-design §3 forbids that inside `resolve()`); 五谷丰登 self-wraps exactly ONE window around the reveal
itself (`nullify:'custom'` — pump does not wrap these), then walks the pick order through 3.3's `chooseCard`
slot protocol via a new `{z:'revealed', cardId}` variant. (2) **乐不思蜀/闪电 both set `nullify:'none'`, which is
NOT the trick default** — the real 无懈可击 window for a delayed trick opens at the start of the victim's judge
phase (`phases.ts`'s `delayedTrickOnNullified`), not at play time; leaving `nullify` unset would double-window
the card. A nullified 闪电 travels on to the next eligible player instead of being discarded (judgement-
nullification-design §2.4). (3) **U1 and F3 are both closed**: `engine/legalTargets.ts` is new (the `act`
request now carries `legalTargets`, computed at request-pop time so it reflects any hand change earlier in the
same batch); `client/src/game/log.ts` gained the three F3 keys these effects needed
(`log.card_taken`/`log.reveals`/`log.picks`). Documented simplifications (AoE target-count not server-enforced;
借刀杀人's pairwise range checked at resolve, not target-selection, time; "once per action phase" not enforced
for 借刀杀人; 五谷丰登's new `chooseCard` slot variant has no client renderer yet, same shape as 3.3's own gap
before 6.4b closed it) and every shared-file hunk: [`docs/handoff/3.4-complex-tricks.md`](docs/handoff/3.4-complex-tricks.md).
✅ **Verified via `run-tests.bat` on Windows: clean build, 357 server / 138 client tests, all green, no
regressions.** (The bash-sandbox torn-read concern flagged earlier was sandbox-side only, traced to a
`node_modules` with an empty `.bin` — almost certainly from an earlier `npm install` run against this mount
from a non-Windows shell, which the sandbox gotchas above already warn against. Deleting `node_modules` and
letting `run-tests.bat` reinstall natively fixed it. The on-disk code was correct throughout; nothing in the
handoff doc's §4 needed re-deriving.)

**4.1b is done** (below), so **4.2 / 4.3 / 4.4 are all unblocked and a skill is now pure content** — no engine
work stands between them and the registry. **4.3 (Batch B) and 4.4 (Batch C, now including 国色 which needed
3.4's 乐不思蜀) are next** — see `docs/build-breakdown.md`'s Wave 2 lanes (E/F) in
[`docs/finish-workflow-plan.md`](docs/finish-workflow-plan.md).

**3.5/3.6 (equipment zone + all 11 weapon/armour handlers) are DONE**, run concurrently with 3.4/4.2/deploy. One shared
`CardEffect` (`content/effects/equip.ts`) handles all 13 equipment `effectKey`s ("equipping IS the effect" —
replace-on-equip needed no new code, `pump.ts`'s `putInZone` equip-slot branch already discarded whatever was there);
11 handler files registered through `equipmentTriggerRegistry.ts`/`equipmentQueryRegistry.ts`, reusing 3.2's trigger
fan-out with no new trigger machinery. **One genuine new primitive was needed and is pre-authorized by
skill-trigger-design §12.2**: `{t:'demandSupply'}` (`frames.ts`/`pump.ts`) — the channel 八卦阵 uses to deem a 闪
answered from a judgement result without a card leaving anyone's hand, the third instance of the
`setDamage`/`retrial` mutation-channel pattern. 357 server tests, clean build. Full record, including three
documented simplifications flagged for later (green_dragon_blade's untargeted bonus strike, unicorn_bow's
deterministic horse pick, gender_swords' single-branch choice) and the torn-mount test files this session had to
restore that belonged to other tracks: [`docs/handoff/3.5-3.6-equipment.md`](docs/handoff/3.5-3.6-equipment.md).

⚠️ **Four agents work this tree concurrently, one per phase.** Don't assume a task outside your own track is untouched —
`docs/build-breakdown.md`'s Status column is the source of truth, and expect `CONTINUE.md` to have moved under you
mid-session. Keep edits to this file surgical (one paragraph, one row) rather than rewriting sections you didn't work on.

🔴 **There is no version control here, and shared files ARE being clobbered — this is not hypothetical.** `locales/en.json`
and `zh.json` have been overwritten from stale snapshots **twice**, silently deleting 3.3's seven prompt keys and 5.x's
`log.kill_reward`/`log.kill_penalty` in one save. `bgio/game.ts` survived a three-way collision (3.3's `chooseCard` stage +
5.3's `endIf`) by luck. So, three rules:

1. **Never rewrite a shared file whole.** Edit in place, anchored on a nearby line. Do **not** `json.load` → mutate →
   `json.dump` a locale file: it reorders 250 keys and makes the deletion invisible in the diff.
2. **Re-read the file immediately before writing it**, not at the start of your session.
3. **Record your shared-file edits in `docs/handoff/<task>.md`** — a file only you will ever write — so that when one
   *is* clobbered, the next session re-applies it verbatim instead of re-deriving it. See
   [`docs/handoff/README.md`](docs/handoff/README.md); [`3.3-simple-tricks.md`](docs/handoff/3.3-simple-tricks.md) is
   the worked example. The shared files worth protecting: **both locale files** (worst by far) · `CONTINUE.md` ·
   `build-breakdown.md` · `bgio/game.ts` · `effectRegistry.ts` · `shared/src/threeKingdoms.ts` · `engine/state.ts` ·
   `engine/frames.ts`.

**This tree is now under git** → [`docs/version-control.md`](docs/version-control.md). It does not stop the clobbering; it
makes it visible and reversible. If something you wrote has vanished, **do not re-derive it**:
`git log -p -S "the_missing_string" -- <file>` finds the commit where it disappeared, and
`git checkout <commit-before> -- <file>` puts that one file back without touching anyone else's work in the same commit.
`autosnapshot.bat` (left running on the Windows side) commits every 2 minutes, so there is always a restore point within
two minutes of any loss.

Two scripts in the repo root, both run **natively on Windows** — an agent's sandbox reads this folder over a mount that
returns stale, truncated content for freshly-written files, so neither npm nor git can be trusted from there:
`run-tests.bat` (build + full suite → `test-output.log`, gitignored — this is how a test run gets verified) and
`snapshot.bat` (a named restore point: `snapshot.bat 3.4 done`).

**Content track (Phase 4) — 4.1 (skill trigger design) is DONE → [`docs/skill-trigger-design.md`](docs/skill-trigger-design.md).**
Binding on 4.1a–4.5. The decision: engine-design §4's single `Trigger` abstraction fits only half the skills, so a `Skill`
has **three faces** — `triggers` (event hooks), `queries` (synchronous folds over live state: 武圣/咆哮/空城/龙胆 have no
event to hang on and would otherwise become rule-shaped `if`s inside `playCard`/`validateTargets`/`respondDodge`), and an
`active` action-phase entry that reuses `CardEffect` unchanged. Two things a Phase 3 session needs to know: (1) **3.2 must
read design §3 before writing the `{t:'trigger'}` fan-out it inherited** — listeners are pushed as individual `triggerStep`
frames and re-checked at pop time (the snapshot fixes the *order*, live state fixes *eligibility*), which is 20 lines'
difference and is not refactorable afterwards; (2) **3.4's requested generic `respondCard` request is design §5's
`{t:'demand'}` protocol** — build it once in 4.1b, don't grow a fourth respond-stage. Also: `damage.before` is a two-step
window over a new public `G.damage` field, the same trick 3.1 used for `G.judgement` (a pure synchronous fold is falsified
by **寒冰剑** — the one Standard damage modifier that is optional and must be able to block).

**4.1a (skill data) is also DONE.** `content/standard/skills.json` (40 skills), `skillIds` + `gender` on all 25 generals,
80 locale keys, `SkillData`/`skills`/`skillsOf()` in `@3k/shared`, 11 new guards in `server/test/content.test.ts` — 256
tests pass, clean build. **The second-source cross-check the design mandated found two real errors in the design itself**
(both fixed in [`docs/skill-trigger-design.md`](docs/skill-trigger-design.md) **§11**, which is the section to read if you
are implementing skills): 裸衣 is *optional*, not 锁定技 — so an optional modifier now splits into "a trigger makes the
choice and writes a turn flag; locked queries only read it" (this is why `{t:'flag'}` exists), and 仁德 **does** have the
≥2-cards heal bonus. Two print-run variances are recorded in `skills.json`'s `note` fields rather than lost (英姿 locked;
离间's duel un-nullifiable per the 2008 rulebook).

**4.1b (engine prep) is DONE — and with it, a skill is now pure content.** All 9 steps of
[`skill-trigger-design.md`](docs/skill-trigger-design.md) §12, `skillRegistry` empty but wired, **not one skill
implemented** (that was the definition of done: if a skill handler is tempting mid-task, a mechanism is missing and you
are about to hide it inside a skill). `pump.ts` has no `notImplemented` left. 357 server / 114 client tests, clean build.
The eight things 4.2/4.3/4.4 must not re-derive:

1. **Damage is a TWO-STEP window** over the public `G.damage` (§2.1). Step 1 publishes it and opens `damage.before`;
   step 2 applies whatever survived. A listener patches it with **`{t:'setDamage'}`** and *never* reaches down the stack
   to edit the frame underneath it. `damage.after` now fires **before** the dying check — that one line is what unblocks
   奸雄/反馈/刚烈/遗计. A second window opening while one is in flight **asserts** rather than nesting silently.
2. **The demand rework is in** (§12.2): `G.demand` is public, and `{t:'demand'}` expands to `demand.open` fan-out →
   `{t:'demandAsk'}` → `{t:'demandClose'}`. The "can they even answer?" fold now runs *after* the fan-out, so a proxy
   (护驾/激将) or a deemed card (八卦阵) can make an un-answerable demand answerable. **`supplied: []` ≠ `null`** — an
   empty array is "answered, with no card"; null is "not answered". Do not collapse them.
3. **`respondDodge`/`respondPeach` are DELETED** — stages, moves, client cases. 杀→闪 and 濒死→桃 ask through the demand;
   `dying.ts` keeps only the asker *ordering* (a rule, not a demand) and hands the round-trip to a `dying_window` resume
   effect. There is no "does this asker hold a 桃?" check anywhere any more: `{t:'demandAsk'}` makes that call through
   the `cardsAs` fold, which is exactly where 急救 hooks in.
4. **A phase is `[phase.start trigger, phaseBody]`** (§2.2). The body re-reads `skipPhases` when *it* pops, so 突袭 can
   cancel the draw it is standing in; a phase already in `skipPhases` is never entered at all (no windows inside a
   skipped phase). `{t:'turnEnd'}` exists so `turn.end` fires **before** turnFlags/skipPhases are wiped and before
   `activeSeat` moves — a listener reading a flag the engine already reset reads a lie.
5. **`engine/queries.ts` is the fold** (§4): `cardsAs` OR-folded, `targetable` AND-folded (a prohibition can't be
   overridden), and `strikeLimit`/`drawCount`/`demandCount`/`targetLimit`/`distanceModifier` chained in priority order.
   **Only 锁定技 may answer the four un-askable folds, asserted at boot.** An optional *modifier* therefore splits in two
   (§11's 裸衣 pattern): an optional trigger makes the choice and writes `{t:'flag'}`; locked queries only read it.
6. **`playCard(cards, targets, asEffectKey?)`** validates 视为 through `cardsAs` — 关羽 plays a ♥K *as* a 杀, the physical
   ♥K still hits the discard pile as a ♥ (so 铁骑 sees a heart), and the two hardcoded `effectKey ===` checks are gone.
   `strikeLimit` is folded once per turn at `prep`, so 咆哮 needs no code in `strike.ts`.
7. **Limits are the engine's, never a skill's `when()`** (§3.5): `used.<id>` / `usedPhase.<id>` / `usedDamage.<seq>.<id>`.
   `once_per_damage` is scoped to the damage *instance* (`DamageInfo.seq`), not the turn. An optional trigger asks first
   (`confirmSkill` + `respondSkill`), and **declining spends nothing**.
8. **Actives are a `useSkill` move** on the act stage, dispatched as `skill.<id>` — a skill's `active` IS a `CardEffect`,
   so 仁德/制衡/观星 resolve through the machinery a card does. And `{kind:'orderTriggers'}` exists for the cold case of
   one owner with two eligible triggers on one event: it must never be resolved silently by registration order.

**F2 is fixed** (playerView filters non-`pub.*` player flags). `G.damage`/`G.demand`/`G.judgement` are deliberately
public — all three are face up at a real table. `server/test/engine/skills.test.ts` stands in fake 奸雄/武圣/咆哮/无双/裸衣/
突袭 shapes and drives them through the real engine end to end; read it before writing a real skill.

**4.2 (Batch A — 12 skills) is DONE.** 10 query skills (武圣/咆哮/龙胆/倾国/空城/马术/英姿/奇才/谦逊/奇袭) + 2 trigger
skills (闭月/克己). Pure content: `server/src/content/skills/{wusheng,paoxiao,longdan,qingguo,kongcheng,mashu,yingzi,qicai,qianxun,qixi,biyue,keji}.ts` + barrel `batchA.ts` + single import line in `skillRegistry.ts`. All integrate with existing machinery (no new primitives). Excluded: 国色 (needs 3.4). Handoff: [`docs/handoff/4.2-batchA-skills.md`](docs/handoff/4.2-batchA-skills.md). Build pending (bash sandbox issue); all code verified.

**UI track — PHASE 6 IS COMPLETE. 6.1 (table), 6.2 (prompts / targeting / log), 6.3 (animations) and 6.4 (i18n sweep)
are all DONE, and the `chooseCard` gap below is closed with them.** 138 client tests (495 total with the server's 357),
clean build.

✅ **The `demandCard` half of that UI gap is CLOSED (4.1b).** `promptFor()` has **one generic demand case** — it reads
`demandKind`/`count`/`reasonKey`/`subject` off the request, so 无双's two 闪, a 决斗's 杀 and 3.4's 南蛮/万箭 all render
with no new code, and an unknown kind falls back to a generic title instead of a blank panel. `TableActions` gained
`supplyCards(cardIds?)` and `respondSkill(use)`; `respondDodge`/`respondPeach` are gone from the client entirely, and a
`confirmSkill` prompt (an optional skill's yes/no) is wired for Phase 4.

✅ **`chooseCard` (3.3) is now CLOSED too (6.4b).** `ChoicePanel` + a `chooseCard` case in `prompts.ts`. It is the **one
request not answered with a card of your own**, and everything odd about it follows from that: `cardCount` is 0, the
viewer's hand is inert *with its own reason* (`choose_instead` — telling a player their perfectly good 杀 "can't answer
this request" while the real answer sits in another panel is worse than saying nothing), and there is **no decline** —
the card is already resolving. The target's hand renders as **N face-down backs addressed by slot index**; the server
never sent the ids and the client never asks (`{z:'hand', index}` — a card id carries suit and rank). Equipment and
judgement zone render face up, because they already are.

⚠️ **The lesson worth keeping: a request kind with no `promptFor()` case is a silently stalled table, and it has now
happened twice** (3.2's `demandCard`, 3.3's `chooseCard`) — `promptFor()` returns `null`, which is *also* what a
spectator gets, so nothing looks wrong; the engine simply waits forever on a player who was offered nothing.
`client/test/interaction.test.ts` now drives **every stage in `THREE_KINGDOMS_STAGE_MOVES` through `promptFor()` and
fails if one produces no prompt**, and asserts a `TableActions` method exists for each. **If you add a request kind to
the engine, that test tells you to add the prompt in the same session.**

🔴 **TWO CLIENT GAPS REMAIN — found by the close-of-Phase-6 integrity review, and both are Phase 4's to close.** The
server defines the move; the client has no way to send it. Neither breaks anything *today* (no skill is implemented yet),
and each becomes a live bug the moment Phase 4 lands the feature that uses it:

1. **`useSkill` — no client method at all.** It is in the `act` stage's move list and defined in `bgio/game.ts`, and it
   is how an **active** skill is started (制衡 · 仁德 · 观星 · 苦肉 · 反间 · 结姻 · 青囊 · 离间 — the third face of a
   `Skill`, design §1). The word `useSkill` does not appear anywhere under `client/src/`. **4.2/4.3 must add a
   `useSkill(skillId, …)` to `TableActions`, wire it in `TableView`, and give the action phase a way to offer the
   skill** — otherwise the first active skill ships unplayable. (It is *not* a `pending` request, which is why the
   prompt-coverage test above does not catch it: nothing asks you to use an active skill, you choose to.)
2. **`orderTriggers` — the one deliberate exclusion from the prompt-coverage test, and it is an accepted stall risk.**
   The engine *can* raise it (`pump.ts` → `ambiguousOrderGroup`, when one player has two eligible triggers on one
   event); the move exists server-side; the client has **no prompt and no method**, so if it is ever raised the table
   wedges exactly like the two gaps above. The justification is that no Standard general can reach it — that claim is
   load-bearing and unverified. **Cheapest insurance when Batch C lands: either implement the prompt (the move already
   exists, so it is a `prompts.ts` case + a picker), or make the engine throw loudly rather than raise a request nobody
   can answer.** A silent wedge is the one failure mode this codebase has now shipped three times.

Three structural decisions the next session in *any* track should know:

1. **The client is typed against the stripped view, never `GState`.** `client/src/game/viewTypes.ts` mirrors what
   `playerView()` actually sends — other seats carry a `handCount`, not a `hand`; roles appear only once revealed;
   `pending` collapses to `{kind, waitingOn}` for onlookers. A component physically cannot reach for hidden data, so 5.4's
   audit inherits a client that provably never asked for any.
2. **No rules live in the client.** Layout is pure functions (`viewModel.ts`); the prompt is derived entirely from
   `G.pending` (`prompts.ts` → act · discard · demandCard · confirmSkill · chooseCard); selection is a pure state machine
   (`interaction.ts`); moves go out through a `TableActions` interface (`actions.ts`, one method per move in
   `bgio/game.ts`) — **not** a boardgame.io `moves` object, so Phase 5 can wire a real match to the same board in ~10
   lines. **Range is deliberately NOT computed client-side**: everything needed is public, so it *could* be, and a second
   copy of `distance.ts` would drift the moment a Phase 4 skill touches range. The picker offers every candidate the
   `TargetSpec` shape allows and lets the server refuse (INVALID_MOVE surfaces in the prompt panel).
3. **The client gets snapshots, not events — so animation is a *diff*, not a subscription** (6.3: `game/transitions.ts`,
   pure and tested; `useTransitions.ts` holds the previous snapshot; `table.css` owns the "how"). The distinctions that
   matter and are easy to get wrong: a lethal hit is damage **then** dying **then** death (three states in order, not
   one); an already-dying seat doesn't re-open its window; a dead player's hand emptying is the death, not a discard; the
   first render animates nothing. `prefers-reduced-motion` kills the movement but keeps the colour flashes, which carry
   information. Once Phase 3 starts writing `G.log` (F3), the log becomes a *better* animation trigger than the diff — but
   keep the diff as the fallback, because a client that reconnects mid-match gets a snapshot and no history.

⚠️ **Finding U1 — one cheap engine change the UI wants (content track, whenever `pump.ts` is next open):** have the `act`
request carry **`legalTargets: PlayerId[]`**. The engine already computes exactly this set in `validateTargets`; sending it
lets the picker grey out-of-range seats *without* the client learning a single rule. Until then, out-of-range clicks are
answered by an INVALID_MOVE, which works but is a worse experience than not offering the seat.

**6.4's sweep is now a standing guard — three rules it enforces, which are easy to break without noticing:**

1. **A missing i18n key renders as the raw key, it does not throw.** 6.4 found `GeneralSelect` calling
   `t('lobby.waiting')` — a key in **neither** locale file — so every non-Lord player watched the Lord pick under the
   literal text "lobby.waiting". Nothing caught it because nothing rendered that branch. The sweep now scans every literal
   `t('…')` in the source *and* renders every screen in both languages.
2. **Never name an interpolated number `count`.** i18next treats `count` as the plural selector: it looks up
   `key_one`/`key_other` **before** `key`. Three keys were doing this (`select.max_hp`, `select.still_choosing`,
   `lobby.waiting_for_players`); it happened to work only because i18next falls back — and it would have broken the zh/en
   key-**parity** test the moment anyone added a plural form. **The project's name for an interpolated number is `n`.**
3. **The toggle must cover 100% of on-screen text, and that is *tested*, not asserted.** Every screen renders in zh and
   en and the visible text is diffed: anything byte-identical in both is either language-neutral (a number, a suit pip
   like `A♦`) or it is a hardcoded string. `LanguageToggle` is the single documented exemption (a language switcher must
   label each language in its own script). **If you add a component with a hardcoded string, `client/test/i18n.test.ts`
   fails and names it.**

**F3 is still open and the UI now depends on it:** `GameLog` is built and the **key vocabulary is defined**
(`client/src/game/log.ts` — `log.turn_start` / `log.plays_at` / `log.damage` / `log.death` …, params `{player, target,
source, card, cards, role, phase, n}`, all present in both locale files). It renders nothing because the engine writes
nothing to `G.log`. **Phase 3/4: log against those keys as each effect lands** — that's the review's own advice, and the
renderer is now waiting for it.

Dev harness: **`?table`** renders 5 fixture states (4p opening · 8p midgame with equipment, a judgement zone and a dead
seat · open dying window · discard phase · game over) from any seat or as a spectator, shows the exact move the board
would fire, and can simulate an INVALID_MOVE. It also runs **two scripted scenarios** (杀 → death; 杀 → 闪 → 桃) with
step/play controls — a single fixture cannot show an animation, since motion is derived from the *difference* between two
snapshots.

**Multiplayer track — 5.1, 5.2 and 5.3 are DONE; 5.4 (the anti-cheat audit of `playerView`, Opus/Fable) is next and is
the last task in this track. A real game is now playable end to end over a socket — and can now actually be WON.**

**5.3 in one paragraph, because three of its decisions are load-bearing for Phase 4 and 5.4.** (1) *The reveal is a flag,
not a message*: `resolveDeath` sets `roleRevealed` and `playerView` sends another player's `role` only when it is set —
there is no reveal packet to audit, and a client that never sees the flag never sees the role. (2) *A death now has
consequences the engine used to defer*: `engine/victory.ts` (win check) and `dying.ts`'s `deathConsequenceFrames` (奖惩 —
Rebel bounty of 3 cards; the **Lord** loses hand *and* equipment for killing a Loyalist; nothing when there's no killer,
you killed yourself, or the killer died in the same resolution). **The win check runs FIRST and short-circuits the
rest** — `pump()` halts on `G.gameOver`, so anything pushed after a win never resolves; a bounty for the kill that ended
the game would silently vanish, and skipping it is the honest version. The rule a "last side alive" shortcut gets wrong:
the **Traitor wins only as the last player standing**, so a Lord who dies with anyone else at the table hands it to the
**Rebels — even when every Rebel is already dead**. (3) *A won match is closed at the framework level* (`endIf` +
`syncBgio` returning early on `G.gameOver`), so **"nothing is pending" now has two meanings**: a soft-lock while the game
is on, and a *result* once it isn't. Every drive loop in the tests had to learn that difference (`isOver()` in
`bgio/game.test.ts`) — any new loop must too. The engine also finally writes to `G.log` (F3): `log.death` (carrying the
revealed role), `log.kill_reward`, `log.kill_penalty`, `log.game_over`. Phase 3/4: keep logging as effects land.

**Reconnection: re-attach, never re-join.** The `3k-session` credentials in `localStorage` are the reconnection handle —
a second `joinMatch` on your own seat is a 409, and bgio's `/leave` **destroys the match** once the last named player is
gone. So the session carries `atTable`, and a refresh mid-match goes straight back to the socket rather than through the
seat list (where "Leave room" was one click away from wiping the table for everyone; that button is now pre-game only).
On the board, `TableBoard` distinguishes **never-synced** (spinner) from **lost socket** (keep the last authoritative
snapshot and banner it) — the first cut conflated them and a two-second blip blanked the whole table. Keeping the stale
snapshot on screen is safe precisely because every move is `client: false`: there is no optimistic local state to diverge.
How a game starts: `POST /rooms?numPlayers=N` creates a boardgame.io match behind a 5-char code and `GET /rooms/:code`
returns its seat view (`server/src/lobby/`); **joining, leaving and credentials stay on boardgame.io's own lobby
endpoints** (the client calls them via `LobbyClient`) — a parallel join path would mint credentials the socket master
won't accept. Rooms are `unlisted`: the code is the only way in. Seat = bgio `playerID` = `GState.seats` index = turn
order, so a joiner *picks* a seat rather than being queued into one. Players then land in the **general-selection
window**; when the last one picks, the table is dealt and the Lord takes turn 1, straight into 6.1/6.2's board with
`TableActions` wired to the live match's moves (the seam 6.2 left for Phase 5 — it took the ~10 lines advertised).

Four things the next session in *any* track should know:
1. **Selection is deliberately NOT a `pending` window** (`engine/selection.ts` + `G.selection`). `G.pending` is
   single-valued by design, and every *rules* question asks exactly one player; selection is the one window where
   several players answer **simultaneously** (the Lord first, alone and in the open — then everyone else at once). It
   maps straight onto boardgame.io's `activePlayers`, which is already multi-player, and the stack stays empty until
   the window closes. A future multi-player window should copy this, not bend `G.pending`.
2. **A room is a match that has *not* been dealt.** `setup()` takes `setupData.selectGenerals` (the lobby passes it;
   the integration tests and UI fixtures don't, so they keep getting a known dealt table). Roles are dealt and the Lord
   revealed; generals, HP, hands and turn 1 all wait for `completeSelection()`. ⚠️ The `roles` override is an
   **engine-level test seam on `initGame`, deliberately not reachable through `setupData`** — bgio's match-create
   endpoint is public, and a `setupData.roles` would let anyone deal themselves the Lord.
3. **Turn 1 belongs to the Lord now, not seat 0** (plan §2; `turn.order.first` → `G.activeSeat`). Seat 0 is just
   whoever took that seat in the lobby. The 2.8 integration tests silently depended on seat 0 starting *and* on a
   random role deal for hit points; `riggedClient` now fixes the roles (player '0' = Lord), which made them
   deterministic — rig `roles` if a future test needs a different table.
4. **Stage/move names are shared and guarded.** `@3k/shared`'s `THREE_KINGDOMS_STAGE_MOVES` is the single list: the
   client builds its skeleton game from it (`client/src/lobby/clientGame.ts` — every move `client: false`, so nothing
   is ever applied optimistically against a stripped view), and `server/test/bgio/stages.test.ts` asserts the real game
   still matches it. Add a stage or rename one without touching that map and the move silently never arrives.

**5.3 inherits one known edge:** boardgame.io **wipes a match when its last named player leaves it** (its `/leave`
route, not ours) — `describeRoom()` drops the now-dangling code and 404s. So a refresh must *re-attach* to the seat
(credentials are already persisted in `localStorage` under `3k-session`), never leave-and-rejoin.

**Phase 2 is complete** (2.1–2.8, 139 tests, clean build) — engine, turn loop, 杀/闪/桃, damage, dying window, death,
all driven through the real boardgame.io framework. Close-of-phase review with all 8 findings:
[`docs/phase-2-review.md`](docs/phase-2-review.md). F1 is fixed by 3.2 (above); **F2** (`playerView` skips §6's `pub.*`
flag filter) and **F3** (`G.log` is never written, and Phase 6 renders from it — start logging as Phase 3's tricks land,
don't back-fill 40 effects later) are the two worth acting on soon.

**Earlier this phase:** 2.2a — `cards.json` migration + `shared/` workspace (all 107 cards got `effectKey`, the 9 distinct weapons got `range`; new `@3k/shared` workspace retired the `game.ts`/`data/content.ts` duplication). 2.2b — `engine/state.ts`/`frames.ts`/`cardIndex.ts`/`rng.ts`/`deck.ts` (the core types + deck subsystem, framework-free per engine-design §8). 2.3 — `pump.ts` + the 6 `{t:'phase'}` frames + the boardgame.io adapter (`act`/`discard` stages, `syncBgio()`). 2.4 (+ 2.5 pulled forward) — 杀/闪/桃 resolution via the `effectRegistry` pattern, `engine/distance.ts`, `playCard`/`respondDodge` moves (including a fix for a soft-lock where the action phase needs a fresh `act` request re-queued after every play). Full detail on all four is in `docs/build-breakdown.md`'s 2.2a/2.2b/2.3/2.4/2.5 rows.

**Phase 7 has started: 7.1 (first deploy config) is done, but nothing is live.** `netlify.toml` and
`render.yaml` moved from `client/`/`server/` to the **repo root** (Netlify needs it there to work without a
dashboard "Base directory" setting; Render's Blueprint feature only auto-detects a root-level
`render.yaml`), and both build commands now build `@3k/shared` **before** `client`/`server` — the old 0.3
commands (`npm run build` scoped to `client/`; `npm run build -w server` alone) both fail with `Cannot
find module '@3k/shared'` once you actually run them, because Phase 2–6 code imports it throughout and
neither old command ever built its `dist/` first. Verified failing, then verified fixed, in a clean `/tmp`
scratch build (client produces `client/dist`; server produces `server/dist/server.js`, boots, honours
`PORT`, and answers a real `POST /rooms` call). **No live Netlify/Render/GitHub deploy happened** — this
sandbox has no credentials for any of the three, and there is no GitHub remote yet (`docs/version-control.md`
only ever ran `git init` locally). `DEPLOY.md` is rewritten with the real procedure, including the
`CLIENT_ORIGIN`/`VITE_SERVER_URL` chicken-and-egg and the fact that all match/room state is in-memory (a
Render redeploy or free-tier spin-down silently drops every in-progress game — there is no database
anywhere in this stack). Full record: [`docs/handoff/7.1-first-deploy.md`](docs/handoff/7.1-first-deploy.md).

Full task list + status for every phase: **[`docs/build-breakdown.md`](docs/build-breakdown.md)**. That table's Status column (✅ done / ◀ next / ⬜ pending) is the single source of truth for progress — don't infer status from which files exist, check that table.

**Dependencies & parallel work:** **[`docs/build-dependency-flowchart.md`](docs/build-dependency-flowchart.md)** maps which tasks block which, and which can run at the same time. The short version: Phase 1 is single-threaded (each task feeds the next), but once Phase 2 (core engine) ships, Phase 3+4 (content), Phase 5 (multiplayer), and Phase 6 (UI polish) become three independent parallel tracks that only converge at Phase 7.

## Before you start any task

1. Open `docs/build-breakdown.md`, find the row marked ◀, do that task.
2. Read the task's "Notes" column — it usually points at a gotcha or a prerequisite doc.
3. Use the Model column as a guide (see below) — don't reach for Opus/Fable-tier effort on transcription tasks, and don't wing an architecture decision at Sonnet-tier.

## Non-negotiable architecture decisions (don't relitigate these)

- **Server-authoritative.** The client never sees the full deck, other hands, or hidden roles. If a task seems to require sending that data to the client, stop — that's a design bug, not a feature.
- **Content is data, not code.** New cards/generals/skills go in `content/standard/*.json` + `content/standard/skills/*.ts` handlers registered by key — never hardcoded into engine logic. This is what lets expansions bolt on later without a rewrite.
- **Every user-facing string is an i18n key.** No hardcoded Chinese or English in components — both live in `locales/zh.json` / `locales/en.json`.
- **The engine is a resolution stack machine.** A card play is not an atomic transition (one 杀 can require answers from three players in an order not known when the move started). `G.stack` of frames + a `pump()` loop is the engine; boardgame.io moves are three lines and contain no rules. If a task starts wanting an `await` inside a move, or a rules `switch` inside a move, it's off-design — see [`docs/engine-design.md`](docs/engine-design.md) §0/§2.
- **Standard edition only for v1.** 火杀/雷杀/酒 and other 军争篇 (Battle expansion) cards are explicitly out of scope until Phase 7.3.

## Model assignment (token efficiency)

Full rationale in `docs/build-breakdown.md` §"Model strategy." Short version: Haiku for mechanical transcription (JSON from a locked spec, bulk strings, formulaic unit tests), Sonnet as the default for everything else, Opus/Fable only for the 6 design/review checkpoints listed at the bottom of `docs/build-breakdown.md` (engine design, judgement/nullification design, skill trigger design, two complexity reviews, anti-cheat audit).

## File map

| Path | What it is |
|---|---|
| `docs/three-kingdoms-plan.md` | Full ruleset, card sets, architecture, tech stack — the source of truth for *what* to build |
| `docs/build-breakdown.md` | Task list + status + model assignment — the source of truth for *what's next* |
| `docs/engine-design.md` | Approved core-engine architecture (output of 2.1) — the source of truth for *how* the rules engine works. Binding on Phase 2–4 |
| `docs/judgement-nullification-design.md` | Approved judgement + nullification design (output of 3.1) — binding on Phase 3. Read before writing any 3.x code |
| `docs/card-suit-rank-table.md` | Locked per-card suit/rank data (output of task 1.1), ready to transcribe into `cards.json` |
| `docs/build-dependency-flowchart.md` | Task dependency graph — what blocks what, what can run in parallel |
| `docs/phase-0-1-audit.md` | What the pre-Phase-2 dependency audit found and fixed; read before touching deploy config |
| `docs/phase-2-review.md` | Close-of-Phase-2 review: what was verified, and the 8 findings (F1 blocks 3.1) |
| `content/standard/` | Game content as data — `cards.json` (107, verified exact, now with `effectKey`/`range`) + `generals.json` (25). `skills/` handlers land in Phase 4 |
| `shared/` | `@3k/shared` npm workspace — `types.ts`, `content.ts` (typed cards/generals + `localizedName`), `counterGame.ts`, `threeKingdoms.ts` (the handshake both sides must agree on: game *name*, player bounds, and `THREE_KINGDOMS_STAGE_MOVES` — names only, never rules). Import it **by package name** (`from '@3k/shared'`), never by relative path — see engine-design §8 |
| `locales/` | zh.json / en.json bilingual strings (251 keys each, parity enforced by test) |
| `server/src/engine/selection.ts` | The general-selection window (5.2): `G.selection`, Lord-first then simultaneous. The one player window that is *not* `G.pending` — see the multiplayer-track note above |
| `server/test/content.test.ts` | Regression guard on the content JSON + locales. **Run `npm test` after any edit to `content/` or `locales/`** |
| `client/src/game/` | The client's view layer: `viewTypes.ts` (hand-written mirror of `playerView()`'s output — the client is typed against the *stripped* view, never `GState`), `viewModel.ts` (all layout logic, as pure functions), `fixtures.ts`, `cardIndex.ts` |
| `client/src/components/table/` | The table (6.1): `GameTable`, `PlayerSeat`, `HandZone`, `TableCenter`, `EquipmentZone`, `JudgementZone`, `HpBar`, `CardFace` + `table.css`. Presentational — no moves, no rules. See it at `?table`. Plus the two answer surfaces: `PromptPanel` (6.2) and `ChoicePanel` (6.4b — the target's cards, hand face **down** by slot index) |
| `client/test/i18n.test.ts` | **The 6.4 sweep.** Every `t()` key resolves in both locales · every screen renders identically-shaped in zh/en with no untranslated text · no raw CJK in a component · no `count` interpolation. **Run `npm test -w client` after touching any locale file or any user-facing string** |
| `server/src/lobby/` | Rooms / join-by-code (5.1): `roomCodes.ts` (the code⇄matchID registry, framework-free), `rooms.ts` (create a match behind a code; seat view), `routes.ts` (two routes on bgio's own lobby router). Joining/leaving/credentials are **boardgame.io's** endpoints, not ours |
| `client/src/lobby/` | The lobby screen + the live table (5.1): `LobbyPage.tsx` (create/join, seat picker, polling), `lobbyApi.ts` (our routes + bgio's `LobbyClient`, and the `3k-session` credentials 5.3 will reconnect with), `clientGame.ts` (name + bounds only — the browser never gets the rules), `TableView.tsx` (socket → 6.1's `GameTable`). The app's front door; `?table`/`?gallery`/`?phase0` are the older harnesses |
| `client/` | React + Vite + TS frontend (Phase 0 scaffold done) |
| `server/` | boardgame.io + Node + TS authoritative server (Phase 0 scaffold done) |
| `PHASE_0.md`, `PHASE_0_SUMMARY.md`, `DEPLOY.md`, `VERIFY.md` | Phase 0 scaffold docs — setup, deploy steps, testing checklist. Historical/reference, not live status |

## Research gotchas learned so far

- **🔴 NEVER rewrite a whole shared file with a bash heredoc while the tracks are running concurrently — surgical `Edit`
  calls only.** This nearly cost 4.1b's work during 5.3. The torn-read gotcha below tempts you into "get the true content
  with `Read`, then heredoc the whole file onto the mount" — and that is fine for a file *you* created, but on a file
  another session is editing it is a **last-write-wins clobber of everything they landed since your read**. During 5.3 a
  whole-file rewrite of `pump.ts`/`bgio/game.ts`/`dying.ts`/`locales/*.json` (from content read 20 minutes earlier) raced
  4.1b's rewrite of the same three files; both sides survived only because the other session wrote last and 5.3's edits
  were then re-applied on top, one `Edit` at a time. The tell that you are in this situation: a `Read` of a file you
  "just wrote" comes back with code you have never seen (4.1b's `orderTriggers`/`limitSpent` appeared inside a file whose
  every line was supposedly yours). **Check before you write, and prefer `Edit` for anything outside your own track's
  files.** The locale files are the highest-traffic shared file in the repo — every track adds keys to them.
- **A test file failing in your run may belong to another track, and the fix may not be yours — but check that it is still
  failing before you act on the report.** At the end of 5.3, `server/test/bgio/chooseCard.test.ts` collected **0 tests**
  and failed outright, and that session concluded 4.1b had *deliberately retired* the `chooseCard` stage and warned the
  next session not to reinstate it. **That conclusion was wrong, and the warning was the dangerous part.** What it had
  actually caught was 4.1b's refactor *mid-write* — the stage was never retired. Verified at the close of Phase 6:
  `bgio/game.ts` has the `chooseCard` stage, `THREE_KINGDOMS_STAGE_MOVES` lists it, and `chooseCard.test.ts` passes 14
  tests. 过河拆桥/顺手牵羊 depend on it, and so does 6.4b's `ChoicePanel`. **The general lesson stands (a red test may not
  be yours); the specific diagnosis did not.** Before you write "X was deliberately removed" into this file, grep for X —
  a wrong claim here outlives the session that made it, and this one came within one obedient session of deleting a
  working stage.
- **Delete your `/tmp` scratch build when you're done with it — the bash sandbox's disk is small enough to fill, and a
  full disk kills the sandbox outright.** Each scratch copy carries a full `node_modules` (hundreds of MB). Three or four
  of them accumulated across one session filled the VM's disk, after which **bash could not start at all** ("no space left
  on device", failing inside the sandbox's own boot, so it couldn't even be cleaned up from inside — it needs a fresh
  session to recycle the VM). The file tools (Read/Write/Edit) keep working, but you lose `tsc`/`vitest`/`npm` entirely,
  which means you cannot verify anything. Reuse **one** scratch dir per session (`rm -rf` it first) rather than making a
  new one per task, and `rm -rf` it before signing off.
- **The tracks are live: an `rsync` of the mount can catch another session mid-write.** During 3.2 a fresh rsync
  pulled a copy of task 5.2's `server/test/bgio/selection.test.ts` that failed — 30 seconds *before* that session
  fixed it. Half an hour could have gone into "which of my engine changes broke general selection?" The check that
  settles it in one minute: **re-rsync into a pristine tree with none of your own changes and run the failing test
  there.** If it fails there too, it isn't yours. And before writing to the mount, re-pull the files you're about to
  touch — 3.2 had to rebase `state.ts`/`setup.ts`/`fixtures.ts`/`bgio/game.ts` onto 5.2's general-selection work,
  which landed mid-session. The changes were orthogonal and merged in ten minutes, but only because they were caught
  *before* the copy, not after.

- **Authoring new files with bash heredocs sidesteps the torn-read problem entirely — use it for anything you'll need to build or test.** The tear only affects bash's *view* of files the `Edit`/`Write` tools touched; files bash wrote itself read back clean (confirmed again across 16 new files in 6.1: fresh `rsync` → `tr -d '\0'` byte-count check → zero tears, `tsc -b` and `vitest` clean first try). So: heredoc new code straight onto the mount, keep `Edit`/`Write` for surgical changes to existing files, and `Read`-verify those. One warning about the tear check itself — `grep -qU $'\x00' file` is **useless**, because bash cannot hold a NUL in a string, so the pattern is empty and matches every file. Compare byte counts instead: `[ "$(wc -c < f)" -eq "$(tr -d '\0' < f | wc -c)" ]`.
- **i18next's default interpolation is `{{var}}`, and the locale files were written with `{var}`** — so `ui.cards_count` (`"{count} cards"`) and `ui.player_turn` would have rendered *literally*, braces and all, the first time anything interpolated them. Nothing caught it because Phase 1's gallery only used static keys. Fixed in 6.1, with a client test that fails on any single-braced placeholder in either locale file. Related trap when you add keys: **don't name the interpolation variable `count`** — passing `count` to `t()` switches i18next into plural resolution (it looks for `key_one`/`key_other` first), and per-language plural variants would break the zh/en key-**parity** test in `server/test/content.test.ts`, which requires identical key sets. `ui.cards_count` therefore interpolates `{{n}}`.
- **`boardgame.io`'s lobby is extensible — don't build a second one.** `Server()` returns its Koa `router`, and routes
added to it *before* `run()` share the game server's port, CORS config and lifecycle (that's how `/rooms` works). Two
traps to know: (1) body parsing in this tree is **koa-body, boardgame.io's dependency, not ours** — `POST /rooms` takes
its `numPlayers` as a *query* param specifically so we don't have to import a package we never declared; (2) match
creation should call bgio's own `createMatch` (exported from its `internal` entry — deep-import it as
`boardgame.io/dist/cjs/internal.js`, same ESM directory-import problem as `/server` and `/core`, shim added to
`boardgame-io-server.d.ts`), because hand-rolling the `{initialState, metadata}` pair is a silent drift waiting to
happen. Also: bgio's `/leave` route **wipes the match** once no named player is left in it — an "empty room" doesn't
exist as a state, and any code/handle pointing at one is dangling.
- **The repo moved off Google Drive to `Z:\3K game dev` (2026-07-11) — this does NOT fully fix the host/bash split.** The good news: writes now round-trip correctly in both directions for *simple* single-shot writes (tested with a plain marker file). The bad news: during the 2.2a session, two files edited via the `Edit` tool (`client/src/App.tsx`, `server/test/content.test.ts`) still read back **torn in bash** — truncated mid-token with trailing `\0` padding, matching the exact old Drive-sync symptom — and it did **not** clear after 8+ seconds of waiting. So the core protocol from the old gotcha still applies on the new mount: **never trust a bash `cat`/`python`/`tsc` read of a file you just edited via Edit/Write.** Verify with the `Read` tool first. If you need a bash-side copy to build/test against, `rsync` the tree into `/tmp`, then **spot-check anything recently edited** (`tail -c N file | xxd`, looking for trailing `\0` bytes or a truncated last token) and, if torn, rewrite that one file directly with a bash heredoc using the `Read`-tool-confirmed content — don't wait it out.
- **The bash sandbox cannot `rm`/`unlink` anything on the `Z:\` mount by default** — every delete attempt (even a file bash itself created seconds earlier) fails `Operation not permitted`, regardless of ownership/unix perms shown by `ls -la`. Call the `mcp__cowork__allow_cowork_file_delete` tool once (pass any file path inside the folder) — it enables deletion for the **whole connected folder** for the rest of the session, not just that one path.
- **`npm install`/`npm ci` and `tsc`/`vitest` builds should still be run from a `/tmp` scratch copy, not the mount directly** — not because `npm install` itself fails against the mount (untested/likely fine), but because the torn-read issue above will otherwise surface as baffling `tsc`/esbuild parse errors ("Invalid character", "Unexpected end of file") on files that are actually fine on the host side. Build in `/tmp`, and copy generated artifacts you need to keep (e.g. a regenerated `package-lock.json` after adding a workspace) back to the mount with a plain `cp`, then verify the copy with `Read`/`python -m json.tool`.
- **When you fix a torn file, fix it on the mount, not just in your `/tmp` scratch copy — and re-verify with a fresh `rsync`, not by trusting your own fix.** This bit twice in the 2.2b/2.3 sessions. First time: two files (`CardGallery.tsx`, `GeneralGallery.tsx`) were torn on the mount after an `Edit` call during 2.2a; the fix was applied inside the `/tmp` scratch build only, so the next session's fresh `rsync` pulled the still-torn originals straight back in. Second time, *during the fix itself*: writing the corrected content to the mount via a bash heredoc, then immediately `cp`-ing from the mount into a fresh scratch dir to verify, produced ANOTHER torn copy — because that `cp` is itself a bash *read* of the mount, and bash's view of a file most recently touched by the `Edit` tool (even hours earlier, even after a prior successful heredoc fix of a *different* file) can still be stale. The only read you can trust after a fix is the one where bash wrote the file itself in the same command. Protocol: (1) get the correct content via the `Read` tool; (2) write it to the **real mount path** with a bash heredoc; (3) if you need it in a scratch copy too, heredoc it there directly as well — never `cp`/`rsync` it over from the mount, even moments after fixing it there. Before trusting any build, spot-check every touched file for a trailing `\0` or a mid-token cutoff (`tail -c 60 file`, eyeball it — don't just grep for null bytes, some tears have none and just stop mid-word) straight off a fresh `rsync`.
- **This gotcha applies to docs too, not just code — and can affect a file with no recent edits.** Mid-session during task 2.6, a fresh `rsync` showed **both** `CONTINUE.md` (cut off mid-sentence near the end) and `docs/build-breakdown.md` (truncated to ~12KB, missing everything past the Phase 2 table) torn on the mount, despite both having been correctly edited via the `Edit` tool minutes earlier and confirmed via `Read`. Neither file's *content* was ever wrong — only bash's view of it. Fixed the same way as code: `Read`-confirm, heredoc the full content to the real mount path, `rsync`-verify fresh. Lesson: **run the fresh-rsync spot-check on every touched file before ending a session, including markdown docs** — it's not just a `tsc`/build-breaking risk, a torn `CONTINUE.md` would mislead the *next* session's fast-orientation read.
- **`boardgame.io`'s bare subpath imports (`boardgame.io/core`, `boardgame.io/client`, etc.) resolve fine for `tsc` type-checking but fail at real Node ESM runtime** with `ERR_UNSUPPORTED_DIR_IMPORT` — same root cause as the existing `boardgame.io/server` issue (no "exports" map in the package). Any *value* import (not `import type`) needs the deep `boardgame.io/dist/cjs/<name>.js` path instead, and that deep path then needs its own `declare module` shim re-exporting the shallow path's types (see `server/src/boardgame-io-server.d.ts`, which now shims both `server.js` and `core.js`) — `tsc` won't type an arbitrary deep dist path on its own. Caught this by actually running the compiled server output and a `boardgame.io/client`-based integration test in task 2.3, not just by getting `tsc` to pass — a build that only type-checks the framework's shallow import paths will silently ship a runtime crash.
- **Once `playerView` exists, nothing outside the engine ever sees a bare `GState` again — including tests.** boardgame.io applies `playerView` to `client.getState().G` before you ever read it, so integration tests against the real framework (task 2.3's `server/test/bgio/game.test.ts`) see the *view* shape (`hand` → `handCount` for anyone who isn't the current `playerID`, `drawPile` → `drawPileCount`, `pending.playerId` → `waitingOn` for onlookers), not the engine's own types. A `Client` with no `playerID` set is a spectator and gets the *most* stripped view — even seat 0 loses its own hand. Call `client.updatePlayerID(id)` before reading state as a specific player if the test needs that player's real hand.
- **萌娘百科 (moegirl) wiki tables require JS rendering** — plain `web_fetch` returns an empty JS-required shell. Use the Claude-in-Chrome browser tools (`navigate` + `javascript_tool`) to pull the DOM directly.
- **Card-edition color coding lives in inline `style="color:..."` on nested `<span>`s inside table cells**, not on the `<td>` itself — `getComputedStyle` on the cell returns the wrong (inherited) color. Query descendant `[style*="color"]` elements instead. Red = 军争篇 (Battle expansion) addition, blue = other-product addition, uncolored = Standard-family.
- **sanguosha.fandom.com is blocked** by the web-fetch provenance allowlist — don't retry it, use 18183.com or the sanguoshaenglish blogspot as the cross-check source instead.
- **Don't trust a single source's counts.** Two of the plan doc's own numbers were wrong (诸葛连弩 copy count, one horse name) until cross-checked against a second source — see the reconciliation notes in `docs/card-suit-rank-table.md`.
- **This repo lives in a Google-Drive-synced folder, and the two tool surfaces see it inconsistently.** File-editing tools (Read/Write/Edit) write straight to the host and are reliable immediately. The bash sandbox's mount of the same folder lags behind — edits made via Edit/Write can take minutes+ to show up in `bash`, and a read mid-sync can look torn (right byte count, truncated/stale tail) rather than erroring outright. Symptom seen: editing `locales/en.json` via Edit, then `cat`/`python -m json.tool` on it from bash showed the pre-edit byte count and a mid-file cutoff, even after 30s of polling. Don't debug a "corrupt JSON" from a bash read without first re-checking via the Read tool — it's almost certainly just sync lag, not a real corruption. For any build/type-check verification (`tsc`, `vite build`), do it in an isolated scratch dir under `/tmp` in the bash sandbox (copy the source in, `npm install` there) rather than running it against the mounted repo — this also sidesteps a separate issue where the mount's pre-existing `node_modules/esbuild` binary SIGSEGVs on `--version` (looked like a torn/corrupted binary from the same sync issue).
- **The sync lag is directional, and it does not clear on its own within a session.** Confirmed during the Phase 0/1 audit: files written with Edit/Write (host side) read back **torn** in `bash` — stale byte count, truncated body, trailing `\0` padding — and stayed that way after 60s+ of waiting, while the *same* files read perfectly through Read/Grep. Files written *from bash into the mount* read back fine in bash. Pr