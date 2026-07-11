# Skill Trigger & Priority Design — Phase 4 (task 4.1)

**Status: approved design. Tasks 4.1a–4.5 implement this; don't redesign it mid-phase.**
Model: Opus-tier decision doc. Everything below is a *decision*, not a suggestion — where a real
alternative was rejected, the reason is given so it doesn't get relitigated.

Prereq reading: [`engine-design.md`](engine-design.md) §2 (the stack), §3 (registry dispatch), §4
(the trigger sketch this doc refines), §6 (`playerView`); [`judgement-nullification-design.md`](judgement-nullification-design.md)
§1.4, §4, §6 (3.1 landed in parallel with this — see §0.5).
Companion: [`three-kingdoms-plan.md`](three-kingdoms-plan.md) §3.4 (the 25 generals).

---

## 0. The insight this document exists to deliver

engine-design §4 sketched skills as **one abstraction — a `Trigger` with an `event`, a `when()` and an
`effect()`**. That abstraction is right for about half the skills and *silently wrong* for the other
half, and the wrong half is where the worst bugs live.

Walk the actual Standard 25 (§8) and three genuinely different shapes fall out:

| Shape | Example | What the engine has to do |
|---|---|---|
| **Trigger** — "when X happens, this may happen" | 奸雄 (take the card that damaged you) | Fan out on an event, run listeners in a defined order |
| **Query** — "what is legal / what is this card / how far is that" | 武圣 (a red card *is* a 杀) · 咆哮 (no strike limit) · 马术 (distance −1) · 空城 (can't be targeted) | Answer a question about **live state, synchronously**, at the moment the engine needs the answer. There is no event to hang it on |
| **Active** — "in your action phase, you may do this instead of playing a card" | 仁德 · 制衡 · 苦肉 · 离间 | Behave exactly like a card play: cost, targets, an effect that returns frames |

A "trigger system" that models only the first shape forces the other two into it, and the result is
the thing engine-design §0 warned about in a different key: **武圣 becomes a special case inside
`playCard`, 咆哮 becomes a special case inside `strike.canPlay`, 空城 becomes a special case inside
`validateTargets`, 龙胆 becomes a special case inside `respondDodge`** — four rule-shaped `if`s in four
files that are supposed to contain no rules. That is exactly how this codebase dies.

So the decision is:

> **Skills are one registry with three faces.** A `Skill` may contribute *triggers* (event hooks),
> *queries* (synchronous answers folded over live state), and/or an *active* entry (a `CardEffect`
> played from the action phase). The engine consults all three through generic machinery that never
> names a skill. Content stays data.

The rest of this doc pins down the machinery for each face, and — the actual hard part, the reason
this task is Opus-tier — **when events fire, how a listener changes something already in flight, and
in what order simultaneous listeners run.**

## 0.5 Reconciliation with 3.1 (which landed while this was being written)

The Phase 3 track finished [`judgement-nullification-design.md`](judgement-nullification-design.md)
in parallel with this task. Three points of contact, resolved here so the two docs don't teach two
patterns:

1. **The generic `{t:'trigger'}` fan-out is implemented in 3.2, not 4.1** (3.1 §1.4 — judgement
   retrial and every 3.6 weapon need it, and both come first). **Accepted.** 4.1 keeps the *policy*
   and adds two **mechanism requirements 3.2 must honour** — §3.3's `triggerStep` frames with
   pop-time re-derivation, and §3.1's snapshot-order rule. 3.2 is the ◀ NEXT task: **read §3 before
   writing the fan-out**, it is 20 lines' difference and it is not refactorable afterwards.
2. **3.1's `G.judgement` field is the pattern this doc reuses for damage** (§2.1). The in-flight
   thing a listener must modify is lifted out of the frame into a public state field, because
   *frames must never be retro-edited* — the lesson 2.6 paid for and 3.1 §2.1 paid for again.
3. **3.4's requested "generic `respondCard` request (`need: 'strike'|'dodge'`)" is this doc's
   `{t:'demand'}` protocol** (§5), generalised for count (无双 needs two) and for proxies (护驾/激将/
   急救 — a *different player* supplies the card). Two tasks converged on the same frame from
   opposite ends; build it once, in 4.1b, and 3.4 consumes it.

---

## 1. The `Skill` type and the registry

`server/src/content/skillTypes.ts`, `server/src/content/skillRegistry.ts` — mirroring
`effectTypes.ts`/`effectRegistry.ts` exactly (same folder, same conventions, same reasons; see
`effectTypes.ts`'s layout note).

```ts
export type SkillId = string;                    // 'wusheng' — matches generals.json .skillIds[]

export type SkillLimit =
  | 'unlimited'
  | 'once_per_turn'                              // 反间, 制衡, 结姻, 青囊, 离间
  | 'once_per_phase'
  | 'once_per_damage';                           // 遗计 is per *point* of damage — §3.5

export interface Skill {
  id: SkillId;
  /** 锁定技 — mandatory, never prompts. For triggers this is just `optional:false`;
   *  for queries it is load-bearing (§4: only locked skills may answer the
   *  folds the engine cannot stop to ask about). */
  locked: boolean;
  /** 主公技 — only live while this player's role is 'lord' (护驾/激将/救援). */
  lordOnly?: boolean;

  triggers?: SkillTrigger[];                     // §3
  queries?: Partial<QueryHandlers>;              // §4
  active?: CardEffect;                           // §5 — the same interface cards already use
}

export interface SkillTrigger {
  id: string;                                    // 'skill.jianxiong' — unique; keys ordering + limits
  event: EngineEvent;
  optional: boolean;                             // optional ⇒ engine asks yes/no first
  priority: number;                              // §3.2 bands
  limit?: SkillLimit;                            // engine-enforced (§3.5); default 'unlimited'
  /** Live-state predicate. Cheap, pure, no side effects — called during
   *  fan-out AND re-called at pop time (§3.3). */
  when(e: TriggerEvent, G: GState, owner: PlayerId): boolean;
  /** Same contract as CardEffect.resolve: returns frames in narrative order,
   *  NEVER mutates G (engine-design §3). */
  effect(e: TriggerEvent, G: GState, owner: PlayerId): Frame[];
}

export const skillRegistry: Record<SkillId, Skill> = { wusheng, jianxiong, /* … */ };
```

**Equipment reuses this exact type.** engine-design §3 said "the weapon's *behaviour* is a set of
triggers registered under the same key" but never said which type, and 3.1 §7 hands 3.6 the fan-out
without naming one either. It is `SkillTrigger`, and 3.6 registers weapon/armour triggers into a
parallel `equipmentTriggerRegistry` keyed by `effectKey`. Same shape, same fan-out, different
priority band (§3.2). **3.6 must not invent a second trigger type** — if it does, every ordering rule
in §3 has to be written twice, and they will drift.

### Listeners are derived, never subscribed — restated, because it is now load-bearing

engine-design §4 decision 1 stands and gets sharper. To collect listeners the engine walks **live**
state: every living player → their general's `skillIds` (+ the `lordOnly` filter) → `skillRegistry` →
triggers matching this event whose `when()` passes; plus their four equipment slots →
`equipmentTriggerRegistry`. No subscription table exists anywhere. This is a correctness requirement,
not a performance one (engine-design §4's 青釭剑 case), and it is *also* what makes §3.3's pop-time
re-check free.

---

## 2. Where events fire (the emission table)

Today the engine emits **nothing**: `pump.ts`'s `'trigger'` case throws, and `phases.ts`'s
`prep`/`end` cases are empty with a `// task 4.1` comment. This section is the authoritative list of
emission points. **An event that isn't in this table doesn't exist** — adding one later is a design
change, not an implementation detail, because §3's ordering guarantees are stated relative to it.

```ts
export type TriggerEvent =
  | { event: 'turn.start' | 'turn.end';   player: PlayerId }
  | { event: 'phase.start' | 'phase.end'; player: PlayerId; phase: TurnPhase }
  | { event: 'card.play';    source: PlayerId; cards: CardId[]; targets: PlayerId[]; effectKey: string }
  | { event: 'card.target';  source: PlayerId; target: PlayerId; effectKey: string; cards: CardId[] }
  | { event: 'card.lost';    player: PlayerId; cards: CardId[]; from: 'hand'|'equip'|'judgementZone' }
  | { event: 'card.gained';  player: PlayerId; count: number }
  | { event: 'demand.open';  from: PlayerId; kind: string; count: number; ctxId: string }   // §5
  | { event: 'damage.before';/* the in-flight damage is G.damage — §2.1 */ }
  | { event: 'damage.after'; source: PlayerId|null; target: PlayerId; amount: number; kind: DamageKind; card?: CardId }
  | { event: 'heal.after';   target: PlayerId; source: PlayerId|null; amount: number; card?: CardId }
  | { event: 'strike.hit' | 'strike.dodged'; source: PlayerId; target: PlayerId; card: CardId }
  | { event: 'judge.card';   target: PlayerId; reasonKey: string }   // BEFORE the result is read (3.1 §1.3)
  | { event: 'judge.result'; target: PlayerId; reasonKey: string }
  | { event: 'dying';        target: PlayerId }
  | { event: 'death';        target: PlayerId; killer: PlayerId|null };
```

| Event | Emitted from | Exactly when | Standard listeners |
|---|---|---|---|
| `turn.start` | `phases.ts` `prep` | before `phase.start(prep)` | — (reserved) |
| `phase.start` | `phases.ts`, every phase | after `G.turnPhase` is set, **before the phase body** (§2.2) | 洛神 · 观星 (prep) · 突袭 (draw) · 闭月 (end) |
| `phase.end` | `phases.ts` / the answering move | after the body, before the next phase frame | 克己 (action) |
| `turn.end` | `phases.ts` `end` | after `phase.end(end)`, **before** `turnFlags`/`skipPhases` are reset | — (reserved) |
| `card.play` | `pump.ts` `'play'` | when the play frame pops, before the effect dispatches | 集智 |
| `card.target` | the effect's `resolve()`, once per target | after targets are locked, before that target responds | 流离 · 铁骑 · 雌雄双股剑 (3.6) |
| `card.lost` | `deck.ts` + 3.1's `{t:'moveCards'}` | after the cards leave the zone | 连营 (hand → empty) · 枭姬 (equip) |
| `card.gained` | `deck.ts` + `{t:'moveCards'}` | after the cards land | — (reserved) |
| `demand.open` | `pump.ts` `'demand'` (§5) | before the demanded player is asked | 八卦阵 (3.6) · 护驾 · 激将 · 急救 |
| `damage.before` | `pump.ts` `'damage'`, step 1 | **window open**, `G.damage` set, nothing applied yet (§2.1) | 寒冰剑 · 仁王盾 · 青釭剑 · 麒麟弓 (3.6) · 裸衣 |
| `damage.after` | `pump.ts` `'damage'`, step 2 | after `hp` is decremented, **before** the dying check | 奸雄 · 反馈 · 刚烈 · 遗计 |
| `heal.after` | `pump.ts` `'heal'` | after `hp` is raised | 救援 (lord) |
| `strike.hit` / `strike.dodged` | `strike.ts` resume | after the 闪 demand is answered | 青龙偃月刀 · 贯石斧 (3.6) |
| `judge.card` / `judge.result` | 3.2's `judge`/`judgeResult` | per 3.1 §1.3 | 鬼才 · 天妒 |
| `dying` | `pump.ts` `'dying'` | once, when the window opens (offset 0) | 急救 (via `demand.open`) |
| `death` | `dying.ts` `resolveDeath` | after the role is revealed | — (Phase 5's kill reward) |

### 2.1 `damage.before`: the listener modifies `G.damage`, **never the frame**

A `damage.before` listener has to *change damage that is already scheduled*: 裸衣 adds 1, 青釭剑 makes
it ignore armour, 仁王盾 zeroes a black 杀, **寒冰剑 prevents it entirely and substitutes discarding
two cards — optionally, which means it must be able to stop and ask its owner.**

The obvious implementation is: push `[trigger(damage.before), damage]`, and let listeners edit the
damage frame sitting underneath them. **That is forbidden**, and not as a matter of taste:

- engine-design §3's iron rule is `effect()`/`effect trigger` **returns frames, never mutates `G`** —
  a listener that reaches down the stack and rewrites a frame it didn't push breaks the one property
  that keeps effects from corrupting each other;
- it is the **stale-continuation anti-pattern this codebase has already been burned by twice** — see
  `CONTINUE.md`'s 2.6 gotcha and 3.1 §2.1, which hit the identical trap in the 无懈可击 chain;
- and boardgame.io's immer-backed state makes "hold a reference to a frame, mutate it later" unsound
  at the framework level, not merely ugly.

**A pure synchronous fold instead of an event was considered and rejected.** It would work — *if*
every damage modifier were mandatory, because a fold cannot stop and ask. **寒冰剑 falsifies it**:
`当你使用【杀】对目标角色造成伤害时，你可以防止此伤害，改为弃置其两张牌` — optional, blocking,
damage-preventing, and it is a Standard weapon (`frost_blade_2s`) that 3.6 ships. One card kills the
fold, so don't build it. (裸衣 is optional too, but in a way the fold *could* have survived — see §11.)

**Decision: `{t:'damage'}` becomes a two-step window over a public in-flight field, exactly mirroring
3.1's `G.judgement`.**

```ts
// engine/state.ts — non-null ⇔ a damage window is open. Public in playerView
// (everyone at a real table can see a 杀 land); the same reasoning as G.judgement.
damage: { source: PlayerId|null; target: PlayerId; amount: number;
          kind: DamageKind; card?: CardId; ignoreArmour?: boolean; prevented?: boolean } | null;
```

```ts
case 'damage': {
  const target = G.players[frame.target];
  if (!target || !target.alive) return;                    // dead-subject rule (3.1 §4)
  if (!G.damage) {                                         // step 1 — open the window
    G.damage = { ...frame };
    pushFrames(G, [
      { t: 'trigger', event: 'damage.before', payload: {} },
      { t: 'damage', ...frame },                           // step 2 re-enters here with G.damage set
    ]);
    return;
  }
  const d = G.damage; G.damage = null;                     // step 2 — apply whatever survived
  if (d.prevented || d.amount <= 0) return;
  target.hp -= d.amount;
  pushFrames(G, [
    { t: 'trigger', event: 'damage.after', payload: { ...d } },
    ...(target.hp <= 0 ? [{ t: 'dying', target: d.target, asker: d.target, offset: 0, killer: d.source }] : []),
  ]);
  return;
}
```

The mutation channel is one new primitive frame — the exact analogue of 3.1's `{t:'retrial'}`, which
patches `G.judgement.cardId` the same way:

```ts
| { t: 'setDamage'; patch: Partial<DamageInfo> }    // amount, kind, ignoreArmour, prevented
```

So 裸衣 is a mandatory `damage.before` trigger returning `[{t:'setDamage', patch:{amount: G.damage.amount+1}}]`;
寒冰剑 is an *optional* one that prompts its owner and, on "yes", returns
`[{t:'setDamage', patch:{prevented:true}}, {t:'request', req:{kind:'chooseCard', …}}, …]`. No frame is
ever retro-edited, optional listeners can block, and there is exactly one pattern to learn.

**Invariant: at most one damage window is open at a time.** Nothing in Standard deals damage from
inside a `damage.before` listener (刚烈's counter-damage is `damage.after`, by which time the window
is closed). Assert it in step 1 rather than silently nesting — the same single-slot assumption
`G.judgement` makes. If an expansion breaks it, `G.damage` becomes a small stack; nothing else
changes.

**仁王盾 nuance, for 3.6:** "黑色【杀】对你无效" is modelled as a `damage.before` prevention, not as an
un-targetable check. Observably identical in Standard (a 杀 that deals no damage does nothing else —
`strike.dodged` only fires when a 闪 was actually supplied, so 青龙偃月刀/贯石斧 correctly stay quiet),
and it avoids inventing a card-level cancel mechanism for one armour.

### 2.2 Phase frames must split so `phase.start` can pre-empt the body (突袭, 克己)

`phases.ts`'s `resolvePhase` does the phase's work *immediately* on pop. 突袭 ("in your draw phase you
may skip drawing and take a hand card from up to two other players instead") must run **before** the
draw and **cancel** it. 克己 must cancel the discard phase from the end of the action phase.

Two new frames — the phase body, and the one sanctioned way for content to write turn state
(§11: 裸衣 needs to *remember* an optional choice). Phase skipping reuses 3.1's `{t:'skipPhase'}`:

```ts
| { t: 'phaseBody'; phase: TurnPhase }     // the default work: draw 2 · open the act request · …
| { t: 'flag'; key: string; value: unknown }   // writes G.turnFlags[key]. No logic, no conditions.
```

`{t:'flag'}` is deliberately dumb, and it is **turn-scoped only** (`G.turnFlags`, cleared at end of
turn). It exists because an effect/trigger may not mutate `G` (engine-design §3) but 裸衣 must record
"I drew one fewer" for the rest of the turn. `PlayerState.flags` stays unused in Phase 4 (§6).

`resolvePhase(phase)` sets `G.turnPhase` and pushes, in narrative order,
`[{t:'trigger', event:'phase.start'}, {t:'phaseBody', phase}]`. **`phaseBody` re-reads live state
when it pops** and does nothing if `G.skipPhases.includes(phase)` — the same pop-time-recheck idiom
`'damage'` uses for `alive` and `'dying'` uses for `hp`. 突袭's trigger returns
`[{t:'skipPhase', phase:'draw'}, …its own steal frames…]`; those resolve before `phaseBody` pops, so
the skip is in place in time. 克己 returns `[{t:'skipPhase', phase:'discard'}]` at `phase.end(action)`,
and `nextPhaseInTurn` (which already consults `skipPhases`) does the rest. No retro-editing, no new
mechanism, and 3.1's primitive gets a second user instead of a rival.

`phaseBody` pushes `[{t:'trigger', event:'phase.end'}, {t:'phase', next}]` when it finishes.
`action`/`discard` still return early after pushing their request, and their answering moves (`pass`,
`discard`) push that same pair instead of the bare `{t:'phase'}` they push today. **That is the only
change 4.1b makes to an existing move.**

⚠️ **克己's counter is not `strikesPlayed`.** The rule is "若你未于出牌阶段**使用或打出**过杀" — a 杀
*played in response* (to a 决斗, or via 激将) counts too, and those never go through `playCard`, which
is the only thing that increments `strikesPlayed` (phase-2-review **F8** — and F8's warning not to
move that counter into `strike.resolve()` still stands). 4.1b maintains a second, separate turn flag
in the demand-supply path: `turnFlags['strikeUsedInAction']`, set whenever a 杀 is played *or*
supplied while `G.turnPhase === 'action'`. Two counters, two different rules, both correct.

---

## 3. Simultaneous triggers: the ordering rules

This is the section that exists because "simultaneous-trigger rules cause the worst bugs if
improvised" ([`build-breakdown.md`](build-breakdown.md) 4.1's own note). Per §0.5 the *mechanism*
ships in 3.2 — so §3.1/§3.3 are **requirements on 3.2**, not on 4.1b.

### 3.1 The fan-out

Resolving `{t:'trigger', event, payload}`:

1. **Collect.** Walk living players (§1) → their skills and equipment → triggers whose `event`
   matches and whose `when()` returns true. Each hit is `{owner, triggerId, priority}`.
2. **Sort.** By `priority` ascending; ties broken by **seat order starting from the current turn
   player** (`G.activeSeat`, walking living seats clockwise) — the standard tiebreak
   (由当前回合角色开始，按座位顺序). Never by player id, never by insertion order.
3. **Same owner, several eligible triggers on one event?** The *owner chooses the order* — push a
   `{kind:'orderTriggers'}` request. Rare in Standard (no general has two triggers on one event; it
   becomes reachable when a skill and an equipment trigger collide — 奸雄 with a future on-damage
   weapon), so implement it and expect it to stay cold. **Do not** silently pick an order: that is a
   rules bug that first shows up in an expansion, when nobody remembers this code.
4. **Push** the sorted list as individual `{t:'triggerStep'}` frames via `pushFrames` (narrative
   order ⇒ first one pops first).

```ts
| { t: 'triggerStep'; ev: TriggerEvent; owner: PlayerId; triggerId: string }
```

### 3.2 Priority bands

| Band | Who | Rationale |
|---|---|---|
| 0–99 | engine-internal (reserved) | |
| **100–199** | equipment | equipment resolves before skills on the same event (八卦阵 before a skill reacting to the dodge) |
| **200–299** | skills (default **200**) | |
| 300+ | lord skills (护驾/激将/救援) | they proxy for the lord *after* his own skills have had their say |

Nothing in the Standard 25 needs a non-default priority — verified against §8. The bands exist so 3.6
and expansions have somewhere to stand.

### 3.3 Re-derive at pop time; the snapshot fixes only the *order*

The sorted list is a snapshot taken at fan-out. Between the snapshot and a given `triggerStep`
popping, the world changes: an earlier listener kills its owner, discards the equipment that granted
a later trigger, or empties the hand a `when()` depended on.

**Requirement on 3.2: `triggerStep` re-checks, at pop time, that (a) the owner is alive, (b) the owner
still has that skill/equipment, (c) `when()` still passes. Any failure ⇒ drop the frame silently.**
A fan-out that snapshots a list of closures and runs them blind is the bug this whole "derive, never
subscribe" architecture exists to prevent, and it is *much* cheaper to build right than to retrofit.

**But eligibility is live while order is frozen** — re-deriving the whole list at each step would let
a listener insert *new* listeners into its own fan-out (a card gained mid-fan-out making some
`when()` newly true), which is neither the rule nor terminating. Both halves are needed and they are
not the same rule.

### 3.4 Optional triggers cost exactly one request

`optional: true` ⇒ `triggerStep` pushes `{t:'request', req:{kind:'confirmSkill', playerId: owner,
skillId, ev}}` plus a `{t:'resume'}` continuation; a `confirmSkill` stage with a single
`respondSkill(use: boolean)` move answers it, exactly like `respondDodge` does today.

`optional: false` (锁定技) runs silently. **Mark this honestly** — an optional trigger that should be
mandatory turns the game into eleven prompts a turn. §8 fixes `optional` for all 40 skills; it is not
the implementer's judgment call.

**Skip the prompt when the answer cannot matter.** If an optional trigger provably can't do anything
(奸雄 when the damage had no card; 反馈 when the source has no cards; 枭姬 with an empty draw pile),
`when()` returns **false** rather than the trigger prompting and no-op'ing. This is part of each
skill's spec, not an optimisation — it is the same call `dying.ts` already makes when it skips an
asker holding no 桃, and 3.1 §2.1 makes for nullification askers.

### 3.5 Limits (每回合限一次) are engine-enforced, never skill-enforced

The engine maintains the counters and checks them before running a trigger or an active:

- `once_per_turn` → `G.turnFlags['used.<id>']`, cleared with `turnFlags` at end of turn.
- `once_per_phase` → `G.turnFlags['usedPhase.<id>']`, cleared on every `phase.start`.
- `once_per_damage` → scoped to the `damage.after` payload instance, **not** a turn flag. 遗计 is per
  *point* of damage: a 2-point hit fires it twice. Standard hits are all 1 point, so this is
  theoretical — but a per-turn counter here would silently halve 郭嘉 on the first expansion that
  isn't, and nobody would find it.

A skill's `when()` **must not** re-implement its own limit check. One mechanism, one place.

### 3.6 Recursion terminates on its own

A listener can push frames that emit further events (刚烈 ⇒ judgement ⇒ `judge.card` ⇒ 鬼才). That's
just more frames. Steps pop exactly once; a re-emitted event is a *new* fan-out with a *new*
snapshot; the `limit` counters stop a skill firing twice on one instance. No Standard chain exceeds
about six deep (杀 → 铁骑 judgement → 鬼才 → 天妒 → damage → 刚烈 → judgement → 鬼才), the stack is a
plain array, and the pump has no recursion. Nothing to guard.

---

## 4. Queries: the synchronous fold

Everything the engine must *ask* about live state, and every skill that answers. `engine/queries.ts`
(engine-side, since the engine asks), folding over handlers contributed by content (skills + 3.6's
equipment).

```ts
export interface QueryHandlers {
  /** 视为/转化 — "may these card(s) be used as `as`?" Takes an ARRAY: 丈八蛇矛 (3.6)
   *  turns TWO hand cards into one 杀. 武圣 · 龙胆 · 倾国 · 奇袭 · 国色 all take one. */
  cardsAs(G: GState, owner: PlayerId, cards: CardDef[], as: string): boolean;
  /** 咆哮 · 诸葛连弩 (3.6). Chained: receives the running limit, returns the next. */
  strikeLimit(G: GState, owner: PlayerId, current: number): number;
  /** 马术 (owner is the measurer) · 飞影-shaped skills (owner is the measured). */
  distanceModifier(G: GState, from: PlayerId, to: PlayerId, owner: PlayerId): number;
  /** 空城 · 谦逊 — may `owner` be targeted by `effectKey` from `source`? AND-folded. */
  targetable(G: GState, owner: PlayerId, source: PlayerId, effectKey: string): boolean;
  /** 奇才 — does `owner` ignore the distance limit for `effectKey`? */
  ignoresDistance(G: GState, owner: PlayerId, effectKey: string): boolean;
  /** 英姿 (+1) · 裸衣 (−1) — how many cards does `owner` draw in the draw phase? */
  drawCount(G: GState, owner: PlayerId, current: number): number;
  /** 无双 — how many cards does a demand from `source` require? (§5) */
  demandCount(G: GState, source: PlayerId, kind: string, current: number): number;
  /** 方天画戟 (3.6) — max targets for `effectKey`. */
  targetLimit(G: GState, owner: PlayerId, effectKey: string, current: number): number;
}
```

**The query set is closed, and small on purpose.** Adding one is a design change — it means the
engine is asking a *new kind of question*. The bias is strict: **if it can be an event, it is an
event.** Queries exist only for questions the engine must answer synchronously, mid-validation, with
no possibility of blocking on a player. (This is exactly why `damage.before` is *not* here — see
§2.1. It is the one place a "query" would have needed to stop and ask.)

Folding rules:

- `cardsAs`, `ignoresDistance` fold with **OR** (any skill may grant); `targetable` folds with
  **AND** (any skill may forbid — a prohibition must not be overridable by a permission).
- `strikeLimit`, `drawCount`, `demandCount`, `targetLimit`, `distanceModifier` are **chained** in the
  §3.2 priority order (equipment before skills), so stacking two modifiers is defined.
- **Only `locked: true` (锁定技) skills may answer `strikeLimit`, `drawCount`, `demandCount` or
  `targetLimit`** — a non-locked answer would need to ask, and the fold cannot ask. Assert this when
  the registry is built: a violation should fail at server boot, not in a playtest.
- **An optional skill that *modifies* something therefore splits in two: the choice is a trigger, the
  effect is a locked query that reads the flag the trigger set.** 裸衣 is the worked example (§11) —
  an optional `phase.start(draw)` trigger asks, pushes `{t:'flag', key:'luoyi'}`, and `drawCount` +
  `damage.before` are mandatory handlers gated on that flag. This is the pattern for every future
  "you may choose to do X, and then Y is different all turn.
- **`cardsAs` is permissive, not automatic.** 武圣 doesn't make a red card *be* a 杀; it *permits* it.
  The move names what the player is playing the card **as**, and `cardsAs` validates the claim (§4.1).

### 4.1 The three hardcoded checks 4.1b deletes

They exist today, and they are precisely the bug this section prevents:

| Today (`bgio/game.ts`) | Becomes |
|---|---|
| `playCard`: `const effect = effectRegistry[card.effectKey]` | `playCard(cardIds, targets, asEffectKey?)` — if `asEffectKey` is given, validate `queries.cardsAs(G, player, cards, asEffectKey)`, then dispatch on it. **The `{t:'play'}` frame already carries `effectKey` separately from `cards`, so no frame changes**: 关羽 plays a ♥K as `{cards:['peach_kh'], effectKey:'strike'}` — the physical card hits the discard pile, the effect resolves as a 杀, and 铁骑/雌雄双股剑 correctly still see a ♥ |
| `respondDodge`: `if (card.effectKey !== 'dodge') return INVALID_MOVE` | the demand protocol (§5), which asks `cardsAs(…, 'dodge')` — this is what 龙胆/倾国/八卦阵 need |
| `respondPeach`: `if (card.effectKey !== 'peach') return INVALID_MOVE` | same (§5) — and it is the only reason 华佗's 急救 can exist |
| `strike.canPlay`: `strikesPlayed < strikeLimit` | unchanged — but `strikeLimit` is now written by `queries.strikeLimit` at `turn.start` (咆哮 ⇒ `Infinity`), so 张飞 needs no code in `strike.ts` |

`playCard` gains **one** line of validation and loses none of its shape. That is the test of whether
§4 is right, and it passes.

---

## 5. The card-demand protocol (`{t:'demand'}`)

The engine asks a player for a card of some kind in five places. Today it does that ad-hoc in two of
them (`strike.ts` pushes a `respondDodge` request; `dying.ts` pushes `respondPeach`), each with its
own hardcoded `effectKey` check. 3.4 independently asked for a "generic `respondCard` request"
(3.1 §7). **Every skill that substitutes, supplies or multiplies a demanded card hooks in here**, so
this is the frame that makes half of Batch C possible at all:

| Demand | Kind | Count | Who answers | Skills |
|---|---|---|---|---|
| 杀 → 闪 | `dodge` | 1 (**2** vs 无双) | the target | 龙胆 · 倾国 · 八卦阵 (3.6 — a judgement *deems* a 闪) · **护驾** (another Wei player answers for the lord) |
| 决斗 → 杀 (3.4) | `strike` | 1 per round (**2** vs 无双) | the current duellist | 武圣 · 龙胆 · **激将** (another Shu player answers for the lord) |
| 濒死 → 桃 | `peach` | 1 | each living player in turn (`dying.ts`'s ordering) | **急救** (华佗 supplies *any red card*, for someone else) |
| trick → 无懈可击 (3.2) | `nullification` | 1 | every player who can respond | 3.1 §2's parity chain |
| 南蛮/万箭 (3.4) | `strike`/`dodge` | 1 | each target in turn | as above |

```ts
| { t: 'demand'; kind: string; from: PlayerId; count: number; reasonKey: string; ctx: EffectCtx }
```

Resolution:

1. **Fan out `demand.open` first.** Proxy suppliers (护驾/激将/急救) and deemed-card producers (八卦阵)
   are ordinary triggers on this event; their effect pushes whatever it needs (a nested demand at a
   *different* player, or a judgement) and writes the supplied card into the demand's resume ctx.
   This is the entire reason the protocol exists — none of these four skills is expressible as a
   `respondDodge` stage.
2. **Can `from` answer at all?** Fold `cardsAs` over their hand for `kind`. No candidates *and* no
   proxy supplied ⇒ resolve immediately as "not supplied": no request, no round-trip. (Same principle
   as `dying.ts` skipping a peach-less asker, and 3.1's `nullifyAskerAtOffset`.)
3. **Ask.** `{kind:'demandCard', playerId: from, demandKind, count, reasonKey}` → the `demandCard`
   stage's `supplyCards(cardIds: CardId[] | null)` move validates each card via `cardsAs`, discards
   them, and writes `supplied` into the resume frame's ctx with the existing `applyToResumeFrame`.
4. `count` comes from `queries.demandCount` (无双 ⇒ 2). **A partial answer is no answer** — supply
   `count` cards or supply none.

`strike.ts`'s `resolve()` collapses to: demand a `dodge`; on resume, `ctx.supplied ? [] : [damage]`
(plus the `strike.hit`/`strike.dodged` emission). `respondDodge` and `respondPeach` — stages *and*
moves — are **deleted** in 4.1b and replaced by `demandCard`/`supplyCards`. `dying.ts` keeps its own
asker-ordering frame (that ordering is a rule, not a demand) but asks through `{t:'demand'}` instead
of pushing `respondPeach` itself. 3.2's `respondNullify` (3.1 §2.1) should be built as a `demand` of
kind `nullification` from day one — its parity/offset logic lives in the `nullifyWindow` effect
exactly as designed; only the *asking* changes.

---

## 6. Skill state, `playerView`, and private reveals

**No Standard skill needs persistent per-player state.** Every limit is engine-maintained (§3.5),
every condition is read live (空城 reads the hand; 克己 reads a turn flag; 裸衣 is locked and always
on). So `PlayerState.flags` stays **empty through Phase 4**, and this doc adds no way to write it —
one fewer primitive, one fewer thing to serialise, and 觉醒技-style state can be designed properly if
an expansion ever needs it.

**Fix F2 anyway.** [`phase-2-review.md`](phase-2-review.md) F2: `playerView` spreads the whole `flags`
object to every client, though engine-design §6 says only `pub.*` keys are public. It is harmless
only for as long as `flags` stays empty; 4.1b adds the filter now, so the first skill that ever needs
state can't leak it by default. **`G.damage` (§2.1) and `G.judgement` (3.1) are public** — both are
face-up at a real table — and 5.4 should confirm exactly that and nothing more.

**Private reveals (观星), with no new mechanism.** 诸葛亮 looks at the top `min(alive,5)` cards and
reorders them. engine-design §6 bans a softened `drawPile` and gestures at "a per-player reveal
field." It isn't needed: **`G.pending` is already per-player filtered** — `playerView` sends the full
pending object only to `pending.playerId` and gives everyone else `{waitingOn, kind}`. 观星's request
carries the five card ids **in its payload**, and they are visible to exactly one player by
construction. No new field, no new boundary.

⚠️ **This makes `PendingRequest` a hidden-information channel**, which it was not in Phase 2. For the
5.4 auditor, in capitals: **anything placed in a `PendingRequest` payload is disclosed to that one
player and to no other — and it must be information that player is entitled to.** 3.1 §5's
slot-based `chooseCard` request exists precisely because the *attacker* is not entitled to the
victim's hand ids; don't undo that by "helpfully" putting the hand in a payload.

---

## 7. 🔴 Blocking data gap — `generals.json` has no skills

Exactly parallel to engine-design §1's `cards.json` gap, and it blocks 4.2 the same way:

```
$ jq '.generals[] | {id, skillIds}' content/standard/generals.json
{ "id": "cao_cao", "skillIds": [] }        ← all 25 are empty
```

`locales/zh.json`/`en.json` contain **zero** skill keys. Task 1.3 shipped the generals with
`skillIds: []` and a note saying "ready for Phase 4." This is Phase 4.

**Task 4.1a — ✅ DONE (2026-07-11).** `content/standard/skills.json` (40), `skillIds` + `gender` on all
25 generals, 80 locale keys, `SkillData`/`Gender` in `@3k/shared`, and 11 new guards in
`server/test/content.test.ts` (256 tests pass, clean build). The cross-check in step 4 below found two
real errors in this document — both are corrected in §11. What the task was:



1. `content/standard/generals.json` — populate `skillIds` for all 25 from §8, and add **`gender`**
   (`male`/`female`): 结姻 and 离间 both need it and nothing in the data has it.
2. `content/standard/skills.json` — **new file**, one entry per skill:
   `{ id, zhName, enName, generalId, locked, lordOnly, kind }`. Data, not code (the handlers are
   4.2–4.4; this is what the UI and the registry-completeness test read).
3. `locales/{zh,en}.json` — `skill.<id>.name` + `skill.<id>.desc` for all 40. Locale parity is
   already enforced by `server/test/content.test.ts`; extend it with "every `skillIds` entry exists
   in `skills.json`" and "every skill has both locale keys."
4. **Cross-check the skill text against a second source before transcribing**, exactly as task 1.1 did
   for the card table (萌娘百科 + 18183). §8 is written from the Standard ruleset and is correct to the
   best of this document's knowledge, but it has **not** been through 1.1's two-source
   reconciliation, and 三国杀 skill text has real cross-print variance — 刘备's 仁德 in particular picked
   up a 桃 bonus in later editions that Standard does not have. This is the one place 4.1 is
   knowingly under-verified. Do not skip it.

---

## 8. The catalog — all 40 skills of the Standard 25

**Kind:** T = trigger · Q = query · A = active. **Opt:** does the engine ask first? (锁定技 ⇒ ✗.)
**Batch:** build-breakdown 4.2 (A) / 4.3 (B) / 4.4 (C).

### 魏 Wei

| General | Skill | Kind | Hook | Opt | Limit | Batch | Notes |
|---|---|---|---|---|---|---|---|
| 曹操 | 奸雄 jianxiong | T | `damage.after` | ✓ | — | B | gain the card that damaged you. `when()` false when the damage had no card (§3.4) |
| 曹操 (lord) | 护驾 hujia | T | `demand.open(dodge)` | ✓ | — | C | other Wei players may supply the 闪. Band 300. Needs §5 |
| 司马懿 | 反馈 fankui | T | `damage.after` | ✓ | — | B | take a card from the source; `when()` false if they have none |
| 司马懿 | 鬼才 guicai | T | `judge.card` | ✓ | — | C | play a hand card to *replace* the judgement card ⇒ 3.1's `{t:'retrial'}` frame. Needs 3.2 |
| 夏侯惇 | 刚烈 gangli | T | `damage.after` | ✓ | — | B | judgement; not ♥ ⇒ the source picks: discard 2, or take 1. Two nested requests. Needs 3.2 |
| 张辽 | 突袭 tuxi | T | `phase.start(draw)` | ✓ | — | B | **replacement trigger** — pushes `{t:'skipPhase', phase:'draw'}` (§2.2) then steals |
| 许褚 | 裸衣 luoyi | T + Q | `phase.start(draw)` → `drawCount` + `damage.before` | ✓ | — | B | **Not 锁定技** (§11). The *choice* is an optional draw-phase trigger that sets `{t:'flag', key:'luoyi'}`; the −1 draw and the +1 杀/决斗 damage (`{t:'setDamage'}`) are mandatory handlers gated on that flag |
| 郭嘉 | 天妒 tiandu | T | `judge.result` | ✓ | — | C | gain the judgement card. Needs 3.2 |
| 郭嘉 | 遗计 yiji | T | `damage.after` | ✓ | `once_per_damage` | C | draw 2, distribute freely. **Per point** (§3.5) |
| 甄姬 | 倾国 qingguo | Q | `cardsAs(dodge)` | ✗ | — | A | any black card as 闪 |
| 甄姬 | 洛神 luoshen | T | `phase.start(prep)` | ✓ | — | B | judge; black ⇒ keep it and repeat. **Self-pushed loop**, not a re-trigger. Needs 3.2 |

### 蜀 Shu

| General | Skill | Kind | Hook | Opt | Limit | Batch | Notes |
|---|---|---|---|---|---|---|---|
| 刘备 | 仁德 rende | A | action phase | — | unlimited | C | give any number of hand cards to other players; **if you have given ≥ 2 this turn, recover 1 hp** — the bonus *is* Standard (§11 corrects this doc's first draft). Needs a per-turn "cards given" counter |
| 刘备 (lord) | 激将 jijiang | T | `demand.open(strike)` | ✓ | — | C | other Shu players may supply the 杀. Band 300 |
| 关羽 | 武圣 wusheng | Q | `cardsAs(strike)` | ✗ | — | A | any red card as 杀 |
| 张飞 | 咆哮 paoxiao | Q | `strikeLimit` ⇒ ∞ | ✗ | — | A | 锁定技 |
| 诸葛亮 | 观星 guanxing | T | `phase.start(prep)` | ✓ | — | C | top `min(alive,5)`, reorder top/bottom. **Private reveal via the request payload** (§6) |
| 诸葛亮 | 空城 kongcheng | Q | `targetable` | ✗ | — | A | no hand ⇒ not targetable by 杀/决斗. AND-folded |
| 赵云 | 龙胆 longdan | Q | `cardsAs(strike\|dodge)` | ✗ | — | A | 杀 as 闪 **and** 闪 as 杀 |
| 马超 | 马术 mashu | Q | `distanceModifier` | ✗ | — | A | −1 when *he* measures |
| 马超 | 铁骑 tieji | T | `card.target(strike)` | ✓ | — | C | judge; red ⇒ the target may not answer the 闪 demand. Writes into the strike's resume ctx. Needs 3.2 + §5 |
| 黄月英 | 集智 jizhi | T | `card.play` | ✓ | — | B | a non-delayed trick ⇒ draw 1 |
| 黄月英 | 奇才 qicai | Q | `ignoresDistance` | ✗ | — | A | 锁定技: no distance limit on trick cards |

### 吴 Wu

| General | Skill | Kind | Hook | Opt | Limit | Batch | Notes |
|---|---|---|---|---|---|---|---|
| 孙权 | 制衡 zhiheng | A | action phase | — | `once_per_turn` | B | discard any number, draw that many |
| 孙权 (lord) | 救援 jiuyuan | T | `heal.after` | ✗ | — | C | 锁定技: a 桃 from a Wu player heals you 1 more. Band 300 |
| 甘宁 | 奇袭 qixi | Q | `cardsAs(dismantle)` | ✗ | — | A | black card as 过河拆桥. **Needs 3.3** |
| 吕蒙 | 克己 keji | T | `phase.end(action)` | ✓ | — | A | no 杀 **used or supplied** this action phase ⇒ skip discard. ⚠️ not `strikesPlayed` — see §2.2 |
| 黄盖 | 苦肉 kurou | A | action phase | — | unlimited | B | lose 1 hp, draw 2. **Can open a dying window on yourself** — see §9 |
| 周瑜 | 英姿 yingzi | Q | `drawCount` +1 | ✗ | — | A | 锁定技. Some printings word it as optional; declining is never advantageous, so v1 locks it (§11) |
| 周瑜 | 反间 fanjian | A | action phase | — | `once_per_turn` | C | target names a suit, then takes a hand card of your choosing face-up; wrong suit ⇒ 1 damage |
| 大乔 | 国色 guose | Q | `cardsAs(indulgence)` | ✗ | — | A | ♦ as 乐不思蜀. **Needs 3.4** |
| 大乔 | 流离 liuli | T | `card.target(strike)` | ✓ | — | C | discard a card ⇒ **retarget** the 杀 to another player in range. Rewrites the in-flight play's target through the strike's resume ctx — never by editing the frame (§2.1) |
| 陆逊 | 谦逊 qianxun | Q | `targetable` | ✗ | — | A | 锁定技: not targetable by 顺手牵羊/乐不思蜀 |
| 陆逊 | 连营 lianying | T | `card.lost` | ✓ | — | B | hand reaches **zero** ⇒ draw 1 |
| 孙尚香 | 结姻 jieyin | A | action phase | — | `once_per_turn` | C | discard 2 hand cards ⇒ heal a wounded **male** 1 and yourself 1. Needs `gender` (§7.1) |
| 孙尚香 | 枭姬 xiaoji | T | `card.lost(equip)` | ✓ | — | B | lose an equipment card ⇒ draw 2. **Needs 3.5** |

### 群 Qun / Heroes

| General | Skill | Kind | Hook | Opt | Limit | Batch | Notes |
|---|---|---|---|---|---|---|---|
| 华佗 | 青囊 qingnang | A | action phase | — | `once_per_turn` | B | discard a hand card ⇒ heal a wounded player 1 |
| 华佗 | 急救 jijiu | T | `demand.open(peach)` | ✓ | — | C | supply **any red card** as a 桃 in *anyone's* dying window, from hand or equipment. Needs §5 |
| 吕布 | 无双 wushuang | Q | `demandCount` | ✗ | — | C | 锁定技: your 杀 demands 2 闪; your 决斗 demands 2 杀 per round. Needs §5 |
| 貂蝉 | 离间 lijian | A | action phase | — | `once_per_turn` | C | discard a card ⇒ two **male** players duel. ⚠️ Source variance (§11): the 2008 rulebook says that 决斗 **cannot be nullified**; later printings allow it. v1 follows 2008 (`nullify:'none'` on the synthesised duel). Needs 3.4 + `gender` |
| 貂蝉 | 闭月 biyue | T | `phase.start(end)` | ✓ | — | A | draw 1 |

**Batch totals:** A = 13 · B = 12 · C = 15. This re-cuts build-breakdown's original guess (which had
甄姬 and 黄盖 in B wholesale — 倾国 is a one-line query ⇒ A, 洛神 stays B; 裸衣 moves to B because
`{t:'setDamage'}` makes it a trigger, not the "simple stat skill" it looks like).

**Cross-phase dependencies, so 4.2–4.4 don't stall:** 奇袭 needs 3.3 · 国色/离间/无双(决斗) need 3.4 ·
枭姬 needs 3.5 · 铁骑/鬼才/天妒/刚烈/洛神/观星 need 3.2's judgement · 护驾/激将/急救/无双/流离 need §5's
demand protocol. **Batch A minus 奇袭/国色 (11 skills) has no Phase 3 dependency at all** and can ship
the moment 4.1b lands, alongside all of Phase 3. That is the real parallelism story, and it is better
than the flowchart's phase-level version.

---

## 9. What this doc deliberately does *not* solve

- **改判 ordering with two competing retrial skills** — 3.1 §8 hands this back to 4.1, and §3 answers
  it: 鬼才 is an ordinary `judge.card` trigger, so two of them are an ordinary simultaneous fan-out,
  sorted by priority then seat order from the turn player, each re-checked at pop time (a retrial by
  the first player changes the card the second is reacting to — which is exactly why §3.3's pop-time
  `when()` re-check is mandatory, not decorative). **The contract 3.2 owes 4.1** is already in 3.1
  §1.3 and holds: `judge.card` re-fires after each replacement; `judge.result` fires once, on the
  final card.
- **F1 (turn player dies mid-turn)** — fixed by 3.1 §6 (filter the phase frames, `unshift` an end
  phase, plus the dead-subject rule). ⚠️ **But 苦肉 reaches F1 with no Phase 3 card at all**: 黄盖 can
  drop himself to 0 in his own action phase with an `act` request queued underneath. So **4.3 cannot
  ship 苦肉 until 3.2 lands the F1 fix** — a harder deadline than phase-2-review knew about, and the
  one place Phase 4 genuinely blocks on Phase 3.
- **General selection** (which of the 25 a player gets) — 5.2.
- **Skill acquisition/loss mid-game** — no Standard general does it. Registries read `skillIds` live
  (§1), so a 化身-style skill is additive, not a rewrite.
- **拼点 · chain reaction · fire/thunder spread** — Battle expansion, out of scope.

---

## 10. Handoff

| # | Task | Model | What |
|---|---|---|---|
| **4.1a** | Data | Haiku | §7: `skillIds` on all 25 + `gender` · new `skills.json` (40) · 80 locale keys · extend `content.test.ts`. **Cross-check the skill text against a second source first** |
| **4.1b** | Engine prep | Sonnet | §1 `skillTypes.ts`/`skillRegistry.ts` · §2 the emission points + `{t:'phaseBody'}` + `{t:'setDamage'}` + the two-step damage window · §3.4/§3.5 `confirmSkill` + limits · §4 `queries.ts` + delete the three hardcoded `effectKey` checks · §5 `{t:'demand'}` (retires `respondDodge`/`respondPeach`) · §6 the `pub.*` filter (F2). **Depends on 3.2** (which owns the `{t:'trigger'}` fan-out per §0.5) and on nothing else. Ends with every existing test still green and **no skills yet** |
| 4.2 | Batch A (13) | Haiku | Queries + 闭月/克己. 11 of the 13 have no Phase 3 dependency |
| 4.3 | Batch B (12) | Sonnet | Reactive triggers. **苦肉 waits on 3.2's F1 fix** (§9) |
| 4.4 | Batch C (15) | Sonnet + **Opus review** | Proxies, retrials, retargets, actives |
| 4.5 | Tests (40) | Haiku | One per skill: build a `GState`, emit the event / call the query, assert the returned frames. No server, no mocks (engine-design §8) |

**The gate for 4.2/4.3/4.4 is 4.1b, not 4.1 — and 4.1b's gate is 3.2.** The flowchart's
"4.2/4.3/4.4 fan out from 4.1" should read **4.1 → 4.1a ∥ (3.2 → 4.1b) → {4.2, 4.3, 4.4} → 4.5**.
4.1a is pure data and can be done right now, in parallel with 3.2, by a Haiku session.

If any of these tasks finds itself adding a rule to a move, a `switch` on a skill id inside the
engine, or a fourth face to `Skill` — stop. That's this design breaking, and it needs an Opus-tier
revisit, not a workaround.

---

## 11. Amendments from the 4.1a source cross-check

§7.4 told 4.1a to verify §8's skill text against a second source before transcribing it, and flagged
that this was the one under-verified part of the design. It was worth doing: the cross-check (against
a full Standard-edition skill list, corroborated by a second summary) found **two substantive errors
and two variances**. The doc above is corrected in place; this section records what changed and why,
so nobody "fixes" it back.

**1. 裸衣 is optional, not 锁定技 — and that is what forced `{t:'flag'}` back into the design.**
The text is `摸牌阶段，你可以少摸一张牌；若如此做，本回合你使用【杀】或【决斗】造成的伤害+1` — the player
*chooses*. So it cannot be a plain locked query (§4 says only locked skills may answer a fold, because
a fold cannot stop and ask), and §6's original claim that *"no Standard skill needs persistent state"*
was wrong: 裸衣 has to remember the choice for the rest of the turn.

The fix is not a special case, it's a **pattern**: *an optional modifier splits into an optional
trigger that makes the choice and writes a turn flag, plus mandatory handlers that read it.* 裸衣's
`phase.start(draw)` trigger asks, pushes `{t:'flag', key:'luoyi', value:true}`, and both `drawCount`
(−1) and `damage.before` (+1 on 杀/决斗) are locked handlers gated on that flag. The locked-only rule
for folds survives intact, and `PlayerState.flags` still stays empty (the flag is turn-scoped).

**2. 仁德 *does* carry the heal bonus.** §7.4 named this as the known trap and guessed the opposite
way: `若你给出的牌张数不少于两张时，你回复1点体力` is in both sources. 仁德 therefore needs a per-turn
"cards given" counter (`G.turnFlags['rende.given']`, via `{t:'flag'}`), and heals **once** as it
crosses two — not once per gift. The instinct that this skill has a version problem was right; the
guess about which way it fell was wrong. **This is exactly the failure mode the "cross-check against a
second source" rule exists to catch, and it caught it.**

**3. 英姿 — accepted variance.** Some printings word it `你可以额外摸一张牌` (optional). Declining is
never advantageous, and modelling it as optional would cost a prompt every single draw phase (§3.4's
"eleven prompts a turn" failure). v1 locks it. Recorded in `skills.json`'s `note`.

**4. 离间's duel — accepted variance, and it is a rules decision, not a modelling one.** The 2008
rulebook adds `此【决斗】不能被【无懈可击】响应`; later printings drop that line and let the duel be
nullified. v1 follows the 2008 text (`nullify: 'none'` on the synthesised 决斗). One field to flip if
playtesters disagree; it is called out in `skills.json`'s `note` so 4.4 can't miss it.

**What did *not* change:** every other row of §8, and every mechanism in §0–§6. In particular 克己's
"used **or played** a 杀" wording (§2.2's second counter), 苦肉's ability to kill its own owner
(§9's F1 deadline), 急救's "any red card, outside your own turn", and 遗计 firing per *point* of damage
were all confirmed verbatim by the source.

### Sources (cross-checked, not recalled)

- [三国杀武将技能 — 胜彬的博客](https://blog.shengbin.me/posts/the-heroes-in-sanguo-and-sanguosha) — full Standard-edition skill list (魏/蜀/吴/群), used as the primary transcription source
- Corroborating summary of 仁德 / 克己 / 裸衣 / 无双 / 急救 wording via web search (matches the above on every point)
- Precedent: [`card-suit-rank-table.md`](card-suit-rank-table.md) — the same two-source discipline task 1.1 used, which is why cards.json has never needed a correction

---

## 12. The 4.1b work order (delta against what 3.2 actually shipped)

Written **after** reading 3.2's merged code, not from the design's own assumptions. 3.2 built more of
this document than §10 expected it to, and it left one wart it explicitly handed back. Read this
section before touching `engine/`; it will save you a day and one wrong mechanism.

### 12.1 Already shipped — do NOT rebuild

| Thing | Where | Notes |
|---|---|---|
| The `{t:'trigger'}` fan-out, `{t:'triggerStep'}`, priority bands, seat-order tiebreak | `engine/triggers.ts`, `content/triggerTypes.ts` | §3.1–§3.3 **in full**, including the snapshot-fixes-order / pop-time-fixes-eligibility split. It is correct; leave it alone |
| `TriggerSource` (derive, never subscribe) | `content/triggerSources.ts` | One source (equipment). 4.1b **appends** a skill source. Nothing else should ever need to |
| The `SkillTrigger` type incl. `limit` | `content/triggerTypes.ts` | The field exists; the *counters* don't. That's 4.1b |
| `{t:'demand'}` + `demandCard`/`supplyCards` | `pump.ts`, `bgio/game.ts` | The frame and the stage exist and the nullification chain already asks through them |
| The three primitives, dead-subject rule, F1 fix, judgement | `pump.ts`, `dying.ts` | Per 3.1 |
| `card.play`, `judge.card`, `judge.result`, `demand.open`, `death` emission | `pump.ts` | The other ten events in the union are **not emitted yet** |

### 12.2 The wart 3.2 handed back — and the mechanism that fixes it

`pump.ts`'s `'demand'` case decides *whether to ask* by filtering the demanded player's hand
**before** the `demand.open` fan-out has run. Its own comment says so: *"this check will move to after
the fan-out then."* It must, because a proxy supplier (**护驾**: another Wei player answers for the
lord) or a deemed-card producer (**八卦阵**: a judgement *becomes* a 闪) can make an un-answerable
demand answerable — and today the engine will have already decided not to ask.

Restructuring the frame is not enough: a proxy's card has to reach the *original* demander's `resume`
ctx, and the proxy's own supply runs through frames of its own. Reaching down the stack to patch
another frame is banned (§2.1), and `applyToResumeFrame` only ever targets the top.

**Decision: lift the in-flight demand into a public state field, exactly as 3.1 did for `G.judgement`
and §2.1 does for `G.damage`. Three fields, one pattern, no exceptions.**

```ts
// engine/state.ts
demand: { kind: string; from: PlayerId; count: number; reasonKey: string;
          supplied: CardId[] | null } | null;
```

`{t:'demand'}` becomes a three-frame sequence (narrative order):

```
{t:'demand'}      → sets G.demand (asserting nothing is already in flight), pushes:
   {t:'trigger', ev:{event:'demand.open', …}}   ← proxies + 八卦阵 get their say FIRST
   {t:'demandAsk'}                              ← if G.demand.supplied is still null: fold cardsAs
                                                  over the hand, and ask only if they CAN answer
   {t:'demandClose'}                            ← reads G.demand.supplied, clears G.demand, and
                                                  applyToResumeFrame({supplied}) — by the time it
                                                  pops, the demander's own resume frame is on top
```

- **Proxies never nest a demand.** 护驾/激将 push a plain `demandCard` request at each eligible
  ally in seat order; 急救 pushes one at 华佗. Their `supplyCards` move writes `G.demand.supplied`
  and the outer demand closes normally. Keeping `G.demand` single-slot (assert on re-entry, same as
  `G.judgement`) is what makes this safe — and no Standard skill nests one demand inside another.
- **八卦阵** (3.6) is a `demand.open` listener that pushes a `{t:'judge', onResult:'eight_trigrams_result'}`;
  the result effect writes `G.demand.supplied = []` — a *deemed* 闪, which supplies the demand
  without a card leaving a hand. That is why `supplied` is `CardId[]`, not `CardId`: an empty array
  is "answered, with no card," and `null` is "not answered." **Do not collapse those two.**
- `count` is read through `queries.demandCount` (无双 ⇒ 2) inside `demandAsk`, not baked in by the
  demander.

### 12.3 Everything else 4.1b owes, in build order

Each row is independently testable; do them in this order and the suite stays green throughout.

| # | Change | Files | Why this order |
|---|---|---|---|
| 1 | `{t:'flag'}` frame (turn-scoped writes) | `frames.ts`, `pump.ts` | Nothing else depends on it, and §11's 裸衣/仁德 both need it |
| 2 | `{t:'phaseBody'}` split + emit `turn.start`/`turn.end`/`phase.start`/`phase.end` | `phases.ts`, `frames.ts`, `pump.ts`, `bgio/game.ts` (`pass`/`discard` push `[phase.end trigger, next phase]`) | 突袭/克己/洛神/观星/闭月 all hang off it, and it's the only change to an existing move |
| 3 | `G.damage` + the two-step window + `{t:'setDamage'}` + emit `damage.before`/`damage.after`/`heal.after` | `state.ts`, `pump.ts` | **`damage.after` is not emitted at all today** — 奸雄/反馈/刚烈/遗计 (a third of Batch B) are blocked on this line alone |
| 4 | `G.demand` + `demandAsk`/`demandClose` (§12.2); retire `respondPeach` — `dying.ts` still pushes it — so the dying window asks through a `demand(peach)` and 急救 becomes possible | `state.ts`, `pump.ts`, `dying.ts`, `bgio/game.ts` | The single biggest unlock: proxies, 龙胆/倾国/武圣 substitution, 无双 |
| 5 | `engine/queries.ts` + the fold rules (§4); `playCard(cards, targets, asEffectKey?)`; delete the two remaining hardcoded `effectKey ===` checks | `engine/queries.ts`, `bgio/game.ts` | Needs (4) in place, since `cardsAs` is what `demandAsk` folds |
| 6 | `content/skillTypes.ts` + `skillRegistry.ts` + append the skill `TriggerSource`; `confirmSkill` request/stage (`triggerStep` **throws** on `optional` today); the three `limit` counters | `content/*`, `pump.ts`, `bgio/game.ts` | The last mechanism gate — after this, a skill is pure content |
| 7 | Emit `card.lost`/`card.gained`/`card.target`/`strike.hit`/`strike.dodged`; delete `dodge.used`/`dodge.missing` from the event union (superseded by `demand.open`) | `deck.ts`, `pump.ts`, `content/effects/strike.ts` | 连营/枭姬/集智/流离/铁骑 + 3.6's 青龙偃月刀/贯石斧 |
| 8 | `playerView`: the `pub.*` flag filter (**F2**), and confirm `G.damage`/`G.demand`/`G.judgement` are public while `G.stack` stays deleted | `bgio/game.ts` | Do it before the first skill ships, not after |
| 9 | `{kind:'orderTriggers'}` request (§3.1 step 3) | `pump.ts`, `bgio/game.ts` | Cold path; `collectListeners` currently falls back to registration order for same-owner ties, which is the one thing §3.1 says must not be silent |

**Definition of done for 4.1b:** `pump.ts` has no `notImplemented` calls left, `skillRegistry` is
empty but wired, every existing test still passes, and **not one skill is implemented**. If a skill
handler is tempting you mid-task, it means a mechanism is missing and you're about to hide it inside
a skill.
