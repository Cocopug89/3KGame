# Judgement + Nullification Design (task 3.1)

**Status: approved design. Tasks 3.2–3.7 implement this; don't redesign it mid-phase.**
Model: Opus-tier decision doc, same contract as [`engine-design.md`](engine-design.md) — everything below is a
*decision*, and where a real alternative was rejected the reason is given so it doesn't get relitigated.

Prereq reading: [`engine-design.md`](engine-design.md) §2 (the stack), §3 (registry), §4 (triggers), §5 (interrupts);
[`three-kingdoms-plan.md`](three-kingdoms-plan.md) §3.2–§3.3; [`phase-2-review.md`](phase-2-review.md) (F1 is fixed here).

---

## 0. What this document decides

Phase 2 shipped a stack machine that can express `杀 → 闪 → damage → 濒死 → 桃`. Phase 3 adds the two
mechanics that machine was *built* for and has never actually run:

1. **判定 (judgement)** — flip the top card of the draw pile, let skills re-flip it, then read it.
2. **无懈可击 (nullification)** — a recursive counter-chain any player may join.

Plus the four smaller things Phase 3 cannot be written without, and which are genuinely design decisions
rather than typing: the **primitive frames** that let an effect move a card (§4), the **card-choice request**
that doesn't leak hidden hands (§5), the **delayed-trick lifecycle** (§3), and the **F1 fix** (§6).

**Rules verified against sources, not memory.** Four rulings below are the ones a naive implementation gets
wrong; all four were cross-checked (sources at the bottom):

| Ruling | Verified |
|---|---|
| 无懈可击 cancels a trick's effect **on one target**, not the whole card | ✅ per-target windows (§2) |
| The window for a **delayed** trick opens at the start of the victim's **judge phase, before the flip** — not when the card is played | ✅ (§3) |
| A nullified **乐不思蜀** is discarded; a nullified **闪电** is **not** — it moves on to the next player | ✅ `onNullified` (§2.4) |
| Multiple delayed tricks resolve **last-placed-first (LIFO)**, and a player may not hold two of the same name | ✅ (§3) — matches what `phases.ts` already pushes |

---

## 1. Judgement (判定)

### 1.1 The lifecycle

A judgement is not "read a card." It is a five-step window with a retrial hole in the middle:

```
flip top of drawPile  →  it is now THE judgement card, face up, public
                      →  retrial window: 鬼才/鬼道 etc. may REPLACE it (repeatedly)
                      →  the final card's suit/rank is read
                      →  the onResult handler runs
                      →  the judgement card goes to the discard pile
```

Every step is observable and interruptible, so it cannot live inside one `resolve()` call. It gets frames.

### 1.2 New state: `G.judgement`

```ts
// engine/state.ts
judgement: {
  target:     PlayerId;        // whose judgement this is
  cardId:     CardId;          // the CURRENT judgement card (a retrial replaces this)
  reasonKey:  string;          // i18n key: 'judge.indulgence' | 'judge.lightning' | 'judge.eight_trigrams'
  sourceCard?: CardId;         // the delayed trick / equipment that caused it
} | null;
```

Non-null ⇔ a judgement is in flight. **It is fully public in `playerView`** — everyone at a real table can see
the flipped card, and a retrial skill in another player's hand is only playable *because* they can see it.
This is the one place a draw-pile card legitimately becomes visible, and it is why it must be lifted out of
`drawPile` into its own field rather than peeked in place: the moment it's flipped it is no longer hidden
information, and §6's rule is *delete hidden zones, never mask them*.

### 1.3 New frames

```ts
| { t: 'judge';       target: PlayerId; reasonKey: string; onResult: string; card?: CardId }  // exists (2.2b)
| { t: 'judgeResult'; target: PlayerId; reasonKey: string; onResult: string; card?: CardId }  // NEW
| { t: 'retrial';     source: PlayerId; card: CardId }                                        // NEW
```

`resolve()` gains:

```ts
case 'judge': {
  if (!alive(frame.target)) return;                      // dead players don't judge (§6's dead-subject rule)
  const cardId = drawTop(G, rng);                        // deck.ts: reshuffles the discard in if empty
  G.judgement = { target: frame.target, cardId, reasonKey: frame.reasonKey, sourceCard: frame.card };
  pushFrames(G, [                                        // narrative order
    { t: 'trigger', event: 'judge.card', payload: { target: frame.target, reasonKey: frame.reasonKey } },
    { t: 'judgeResult', ...frame },
  ]);
  return;
}

case 'judgeResult': {
  const j = G.judgement!;                                // whatever the retrial window left behind
  G.judgement = null;
  G.discardPile.push(j.cardId);                          // "判定牌在判定结果结算后弃置"
  dispatchEffect(frame.onResult, { target: frame.target, judgeCard: j.cardId, sourceCard: j.sourceCard }, G);
  return;
}

case 'retrial': {                                        // pushed by a retrial skill's trigger (Phase 4)
  const j = G.judgement!;
  G.discardPile.push(j.cardId);                          // the old card is discarded immediately
  j.cardId = frame.card;                                 // the replacement IS the judgement card now
  G.stack.push({ t: 'trigger', event: 'judge.card', payload: { ... } });  // re-open: retrials chain
  return;
}
```

Three things this shape buys, all load-bearing:

- **The retrial window is a plain trigger fan-out**, so 鬼才 is a skill like any other and needs no judgement-specific
  machinery. It re-fires after each replacement, which is exactly the rule (a second retrial skill may answer the first).
- **`onResult` is an `effectKey`** — the result handler is content, dispatched through the existing registry.
  `lightning_result`, `indulgence_result`, `eight_trigrams_result`. The engine never knows what ♠2–9 means.
- **The judgement card is discarded before the result runs**, so a result that itself moves cards (闪电 dealing damage
  that kills someone) can't collide with a card still in limbo.

### 1.4 ⚠️ Scope adjustment: `{t:'trigger'}` must be implemented in 3.2, not 4.1

`pump()` currently *throws* on a `'trigger'` frame ("not implemented until 4.1"). Judgement needs the fan-out
(retrial), 3.6's 八卦阵 needs it (`dodge.missing`), and every weapon in 3.6 needs it (`strike.dodged`,
`damage.before`). **3.2 implements the generic trigger mechanism exactly as engine-design §4 already specifies it**
— derive listeners from live state, sort by `priority` then seat order from the turn player, push in reverse,
optional triggers cost a `request` first. That is a *mechanism*, and it's already designed.

**4.1 keeps what it was always for:** the skill-level policy — per-skill priority numbers, which skills are
optional, and how a player orders several of their own simultaneous triggers. Nothing in 4.1's remit moves; it
just stops being a prerequisite for equipment that has to exist first anyway. In 3.2 the `skillRegistry` is empty
and the fan-out finds nothing — which is a no-op, not a stub.

---

## 2. Nullification (无懈可击)

### 2.1 The model: parity, not recursion

A nullification chain is N cards deep, each cancelling the one before. Resolution is LIFO, and the outcome
depends only on **the parity of N**: odd ⇒ the original effect is cancelled, even ⇒ it happens.

So don't build a nested stack of windows. Build **one window that re-opens itself with the parity flipped**:

```ts
// content/effects/nullifyWindow.ts — an ordinary CardEffect, dispatched through the existing registry.
ctx = {
  protect:      Frame,           // the effect frame this window guards
  onNullified?: Frame,           // what to push INSTEAD if the chain lands odd (default: nothing) — see §2.4
  parity:       0 | 1,           // 0 = the protected frame happens, 1 = it's cancelled
  offset:       number,          // how far round the ask-circle we are
  reasonKey:    string,
}
```

`resolve()`:

```
asker = nullifyAskerAtOffset(G, G.activeSeat, offset)      // next LIVING player who CAN respond, clockwise
                                                           // from the current turn player (标准: 由当前回合角色开始)
if (asker === null)                                        // everyone's been asked; the chain is closed
    return parity === 0 ? [protect] : (onNullified ? [onNullified] : [])
return [ { t:'request', req:{ kind:'respondNullify', playerId: asker, reasonKey, ... } },
         { t:'resume',  effectKey:'nullify_window', ctx } ]
```

and the `respondNullify` move (bgio adapter, three lines like every other move):

- **"yes" + a 无懈可击** → validate + discard it, then `applyToResumeFrame(G, { parity: parity ^ 1, offset: 0 })`.
  Parity flips, and the ask-circle **restarts from the top** — because everyone now gets a chance to counter
  *that* 无懈可击. Restarting is mathematically identical to nesting a fresh window, and needs no new frame type.
- **"no"** → `applyToResumeFrame(G, { offset: offset + 1 })`.

Then clear `G.pending` and `pump()`. This is the `respondDodge` pattern verbatim, and it reuses the one frame the
engine is allowed to patch (`'resume'`) — the exact mechanism [`engine/dying.ts`](../server/src/engine/dying.ts)'s
header comment says to prefer over "push X and re-push Y underneath it." **The 2.6 lesson applies here and this is
where it gets paid back:** engine-design §5's literal wording for this chain would have hit the same stale-frame bug.

**Only holders are asked.** `nullifyAskerAtOffset` skips anyone who can't answer — same as the dying window skips
players with no 桃. The server knows every hand, so an un-answerable prompt is a wasted round-trip, not fairness.
`canRespondNullify(G, p)` is the single extension point Phase 4 hooks (a skill that produces a 无懈可击 from
elsewhere makes its owner an asker).

### 2.2 What is nullifiable, and per-target expansion

Add one declarative field to `CardEffect`:

```ts
nullify?: 'none' | 'once' | 'per_target' | 'custom';   // default: 'once' for type:'trick', 'none' otherwise
```

`resolve('play')` in `pump.ts` reads it:

| Value | Behaviour | Cards |
|---|---|---|
| `'none'` | dispatch straight through, as today | 杀 · 闪 · 桃 · all equipment |
| `'once'` | wrap the whole effect frame in one window | 无中生有 · 决斗 · 顺手牵羊 · 过河拆桥 · 借刀杀人 · 乐不思蜀/闪电 *at play time — see §3* |
| `'per_target'` | one **independent** window per target, each around `{t:'effect', ctx:{…, targets:[t]}}` | 南蛮入侵 · 万箭齐发 · 桃园结义 |
| `'custom'` | the effect wraps its own frames; pump doesn't touch it | 五谷丰登 only |

`'per_target'` is the ruling in row 1 of §0: 无懈可击 cancels *"一张锦囊牌对一名角色产生的效果"* — one target's slice.
A 无懈可击 on a 3-target 南蛮入侵 saves one player, and the other two still have to answer with a 杀.

**Why `'custom'` exists (one card, and only one).** 五谷丰登 reveals N cards *once*, then each player picks one in
turn order. That shared reveal can't be re-run per target, so pump's mechanical wrap is wrong for it: the effect
emits an unwrapped `{t:'moveCards', to:'revealed'}` setup frame, then wraps each player's pick itself, then a
cleanup frame. Rather than teach pump about setup/apply phases for the sake of a single card, `'custom'` says
"this effect handles its own windows" and 3.4 writes those five lines by hand.
*Rejected alternative:* a `phase: 'setup'|'apply'` discriminator on `EffectCtx` — more machinery, one user, and it
would silently do nothing for every other card.

### 2.3 Recursion is free, and it terminates

A played 无懈可击 is itself a trick, and it can itself be nullified — which is exactly what "restart the circle with
parity flipped" does. Termination is guaranteed because **every "yes" permanently removes a 无懈可击 from a hand**
(the move discards it), and there are 3 in the deck. A chain cannot exceed the number of 无懈可击 in play.

### 2.4 `onNullified` — the rule everyone gets wrong

Cancelling an effect is usually "don't push the frame." **闪电 is the exception:** a nullified 闪电 is *not*
discarded — it moves on to the next player's judgement zone exactly as if the judgement had missed. So the window
carries an optional `onNullified` frame, pushed instead of `protect` when the chain lands odd:

| Card | `protect` | `onNullified` |
|---|---|---|
| 乐不思蜀 (in the judge phase) | `{t:'judge', onResult:'indulgence_result'}` | `{t:'moveCards', cards:[乐], from:{z:'judgementZone', player:target}, to:{z:'discard'}}` |
| 闪电 (in the judge phase) | `{t:'judge', onResult:'lightning_result'}` | `{t:'effect', effectKey:'lightning_pass', ctx:{owner:target}}` — travel, don't discard |
| everything else | the effect frame | *(absent — cancelled means nothing happens)* |

---

## 3. Delayed tricks (延时锦囊): placement, order, travel

**Placement (action phase).** 乐不思蜀 targets another living player at **any distance**; 闪电 targets **yourself**.
Both are `nullify: 'once'` *at play time* — but see the timing trap below. A player's judgement zone may hold at most
**one card of a given name** (`predicate` on the `TargetSpec` enforces it: no target who already has a 乐不思蜀).

**⚠️ The timing trap.** Playing a delayed trick puts a card in a zone; it does not *take effect*. The 无懈可击 window
that matters opens **at the start of the victim's judge phase, before the judgement card is flipped** — not when the
card is played (source in §0). A naive implementation opens the window at play time and nowhere else, and every
delayed trick in the game becomes un-nullifiable in practice. So:

```
resolvePhase('judge'):
  push { t:'phase', phase: next }                       // runs LAST (already correct in phases.ts)
  for each card in target.judgementZone (oldest → newest):     // pushed in order ⇒ NEWEST pops first = LIFO ✅
      push nullifyWindow{ protect: {t:'judge', onResult: <card's result key>, card},
                          onNullified: <per the table in §2.4>,
                          parity: 0, offset: 0 }
```

`phases.ts` already walks the zone in exactly this order and pushes the next-phase frame first — 2.3 wired the
LIFO correctly, sight-unseen. It only has to start wrapping each `{t:'judge'}` in a window and filling in the real
`onResult` key (it currently pushes `onResult: ''`).

**Results.**

- `indulgence_result`: judgement **not ♥** ⇒ `[{t:'skipPhase', phase:'action'}]`. Either way the 乐不思蜀 card itself
  goes to the discard after the judgement (it is consumed).
- `lightning_result`: judgement **♠2–9** ⇒ `[{t:'damage', source:null, target, amount:3, kind:'thunder'}, {t:'moveCards', …discard the 闪电}]`;
  otherwise ⇒ `[{t:'effect', effectKey:'lightning_pass', …}]`.
- `lightning_pass`: move the 闪电 into the **next living player's** judgement zone, clockwise — **skipping anyone who
  already has a 闪电** (verified ruling), and skipping the dead. If nobody can take it (everyone left has one), it
  stays put. `source: null` on the damage frame is deliberate: 闪电 has no killer, so no Phase 5 kill reward.

---

## 4. Primitive frames (the thing Phase 3 actually can't be written without)

engine-design §3's hard rule — *"`resolve()` returns frames, NEVER mutates G"* — is what keeps effects from reaching
into each other. But Phase 2 only ever needed two mutation primitives (`damage`, `heal`), so every *card movement* so
far has happened inside a move (`discardFromHand`). Tricks move cards from inside the engine (过河拆桥 discards a card
the player never touched; 顺手牵羊 steals one). Without primitives, effects must either mutate `G` (breaking §3) or
each invent their own frame type (breaking §2's closed union).

**Three new primitive frames. That's the whole list; resist adding a fourth.**

```ts
type Zone =
  | { z: 'hand' | 'equip' | 'judgementZone'; player: PlayerId }
  | { z: 'discard' | 'drawPile' | 'revealed' };        // 'revealed' = the 五谷丰登 pool, public, transient

| { t: 'moveCards'; cards: CardId[]; from: Zone; to: Zone; by?: PlayerId }   // NEW — the universal card mover
| { t: 'draw';      player: PlayerId; count: number }                        // NEW — 无中生有, kill-a-rebel reward
| { t: 'skipPhase'; phase: TurnPhase }                                       // NEW — 乐不思蜀 (writes G.skipPhases)
```

`moveCards` subsumes: discard-a-target's-card, steal, equip (hand → `equip`, auto-discarding whatever it replaces),
delayed-trick placement (hand → `judgementZone`), 闪电's travel, and death's zone-dump. Equipping is *not* a special
case — engine-design §3 already says "equipping is the effect"; it's `moveCards` to an `equip` zone, and the weapon's
*behaviour* is triggers.

**Every frame with a player subject drops silently when that player is dead** when it's popped — `damage`/`heal`
already do this; `judge`, `moveCards`, `draw`, `skipPhase`, `effect`-per-target and `request` all join the rule. This
is engine-design §5's *"only the frames targeting the dead player are dropped, and the engine does that by checking
`alive` when a frame is popped, not by scrubbing the stack."* Make it a shared `subjectOf(frame)` helper, not six
copy-pasted guards.

---

## 5. Choosing a card you can't see (过河拆桥 / 顺手牵羊)

The attacker picks one of the target's cards. Their equipment and judgement zone are public — but their **hand is
not**, and `playerView` §6 bans masking: card ids leak suit and rank by construction, so the server cannot send the
target's hand ids and let the client pick one.

**The request enumerates slots, not cards:**

```ts
{ kind: 'chooseCard', playerId: attacker, target: victim,
  choices: [ { z:'hand', index: 0 }, … { z:'hand', index: handCount-1 },   // opaque positions
             { z:'equip', cardId: 'green_dragon_blade' },                  // public ⇒ named
             { z:'judgementZone', cardId: 'indulgence_2s' } ] }
```

The answer is a slot; the **server** maps `{z:'hand', index:n}` → a real id. The client renders N face-down card
backs, which is precisely what a player sees across a real table. **The hand order the index refers to must be the
server's own array order** — never re-sorted per client, or the same index means two different cards.

This is a small decision with a long shadow: it's the pattern for every future "pick from a hidden set" (拆/迁/黄盖's
苦肉 doesn't need it, but 4.4's 大乔 and 陆逊 will). Get it right once here.

---

## 6. F1 fix: the turn player dies during their own turn

[`phase-2-review.md`](phase-2-review.md) F1: `pump()`'s `'request'` case never checks `alive`, so when 决斗 backfires or
闪电 kills the turn player during their judge phase, the `act` request queued underneath the play pops after the death
and the engine blocks on a corpse with an empty stack. Permanent wedge, reproduced against `pump()`. Phase 3 makes it
reachable on its first two cards, so it is fixed **here, in 3.2, before either card is written**.

The tension is real: the rule is *"the turn player dies ⇒ their turn ends immediately,"* but engine-design §5 forbids
cancelling the rest of the stack (*"an AoE that kills player 3 still hits players 4 and 5"*). The fix has to end the
turn **without** discarding work that belongs to other players. Two lines, in `resolveDeath`:

```ts
// engine/dying.ts, at the end of resolveDeath(G, target):
if (target === G.seats[G.activeSeat]) {
  G.stack = G.stack.filter((f) => f.t !== 'phase');      // drop the rest of THIS turn's phase frames
  G.stack.unshift({ t: 'phase', phase: 'end' });         // …and end the turn once everything in flight drains
}
```

`unshift` = push to the **bottom** of the stack. Everything currently in flight (the AoE still owed to players 4 and 5,
a nullification chain mid-argument, the killer's own trigger) resolves first, exactly as §5 demands; then the stack
bottoms out on the end-phase frame, which resets `turnFlags`/`skipPhases` and advances `activeSeat` past the corpse via
`nextLivingSeat`. There is never more than one `{t:'phase'}` frame on the stack at a time, so the filter is precise, not
a blunt instrument — no `turnId` tagging needed.

The dead-subject rule from §4 is the backstop: the dead player's own `act` request and any remaining `{t:'judge'}`
frames from their zone drop when popped. **Belt and braces, both server-side** — with the filter alone, a request frame
that some *effect* (not the phase machine) queued for the now-dead player would still wedge; with the dead-subject rule
alone, the turn would never end.

**While you're in `resolveDeath`, thread the killer through.** `{t:'damage'}` carries `source`; `{t:'dying'}` doesn't,
so by the time anyone dies the killer has been forgotten and Phase 5's reward/penalty (Lord kills a Loyalist ⇒ Lord
discards everything; kill a Rebel ⇒ draw 3) can't be implemented without re-threading it through four frame types.
Add `killer: PlayerId | null` to `{t:'dying'}` and pass it to `resolveDeath` **now**, while it's free. Nothing in
Phase 3 reads it.

---

## 7. Handoff: what each Phase 3 task now owes

| Task | What this design pins down |
|---|---|
| **3.2** | `G.judgement` + `judge`/`judgeResult`/`retrial` frames (§1) · the generic `{t:'trigger'}` fan-out per engine-design §4 (§1.4) · `nullifyWindow` effect + `respondNullify` stage/move + `CardEffect.nullify` (§2) · the three primitives (§4) · the **F1 fix + dead-subject rule + `killer`** (§6) |
| **3.3** | 过河拆桥/顺手牵羊 use the slot-based `chooseCard` request (§5); 无中生有 is `{t:'draw'}`; all are `nullify:'once'` |
| **3.4** | 决斗/南蛮/万箭 need a **generic `respondCard` request** (`need: 'strike' \| 'dodge'`) — fold `respondDodge` into it rather than growing a fourth near-identical stage. AoEs are `nullify:'per_target'`; 五谷 is the one `'custom'`. Delayed tricks per §3. **A 杀 played to answer a 决斗/南蛮 must not count against `strikeLimit`** — it doesn't go through `playCard`, so this is already right; don't "fix" it |
| **3.5** | Equipping = `{t:'moveCards'}` into an `equip` zone, auto-discarding the replaced card (§4) |
| **3.6** | Every weapon/armour effect is a **trigger**, not a `CardEffect` — the fan-out from 3.2 is what they register against. 八卦阵 hooks `dodge.missing` and pushes a `{t:'judge', onResult:'eight_trigrams_result'}` |
| **3.7** | Test the parity chain to depth 3 (all 3 无懈可击 in one argument), a nullified 闪电 *travelling* rather than dying, a retrial changing a judgement result, and F1: kill the turn player mid-action-phase and assert the turn ends cleanly |

## 8. What this document deliberately does *not* decide

- **Per-skill trigger priorities, optionality, and same-player trigger ordering** — 4.1. §1.4 hands 4.1 a working
  mechanism; it still owns the policy.
- **改判 with two competing retrial skills** — 4.1's ordering rules answer it; the `retrial` frame's re-fired
  `judge.card` trigger already makes it *expressible*.
- **拼点, chain reaction, fire/thunder spread** — out of scope (Battle expansion), as before.
- **Win conditions and the kill reward itself** — Phase 5. §6 only makes sure the killer's identity survives long
  enough to be usable.

---

### Sources (rulings cross-checked, not recalled)

- [无懈可击 — 百度百科](https://baike.baidu.com/item/%E6%97%A0%E6%87%88%E5%8F%AF%E5%87%BB/1566616) — cancels a trick's effect on **one** designated target
- [判定阶段详解 — 逗游网](https://www.doyo.cn/article/80073) — judge-phase sequence; delayed-trick nullification timing
- [三国杀游戏规则详细 FAQ](https://ks3-cn-beijing.ksyun.com/attachment/74ad98665ac744c138ba8c988d85d149) — 无懈可击 on a delayed trick must be used in the victim's own judge phase, before the flip; a nullified 闪电 passes on rather than being discarded; a 闪电 skips a next-player who already has one
- [延时类锦囊 — 百度百科](https://baike.baidu.com/item/%E5%BB%B6%E6%97%B6%E7%B1%BB%E9%94%A6%E5%9B%8A/4332129) / [判定区 — 百度百科](https://baike.baidu.com/item/%E5%88%A4%E5%AE%9A%E5%8C%BA/16184864) — 后置入先结算 (LIFO); one card of a given name per judgement zone
- [三国杀中在乐不思蜀生效时可以用无懈可击吗？ — 知乎](https://www.zhihu.com/question/514618772) — a nullified 乐不思蜀 is discarded and no judgement occurs
