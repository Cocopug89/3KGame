// Frame is a closed discriminated union — a unit of work the engine owes the
// game. See docs/engine-design.md §2, docs/judgement-nullification-design.md
// (3.1) §1/§2/§4, and docs/skill-trigger-design.md (4.1) §2/§3.
//
// This module must not import boardgame.io — see docs/engine-design.md §8.
// Types are imported type-only from ./state.js (see the note there about the
// safe type-only circular reference).

import type { CardId, DamageInfo, PendingRequest, PlayerId, TurnPhase } from './state.js';

/**
 * Opaque bag of per-effect working state, carried by 'effect' and 'resume'
 * frames. Each effect module defines its own shape and casts; kept as a plain
 * record here so frames.ts doesn't need to know about every effect that will
 * ever exist (docs/engine-design.md §3).
 */
export type EffectCtx = Record<string, unknown>;

export type DamageKind = 'normal' | 'fire' | 'thunder';

/**
 * The payload a trigger listener receives. skill-trigger-design §2's emission
 * table is authoritative: **an event that isn't in this union doesn't exist**,
 * and adding one is a design change, not an implementation detail, because
 * §3's ordering guarantees are stated relative to it.
 *
 * Task 3.2 only *emits* the subset it owns (judgement, demand, card.play,
 * dying/death); the rest of the emission points land with 4.1b. The type is
 * complete from the start so no listener has to be re-typed later.
 */
export type TriggerEvent =
  | { event: 'turn.start' | 'turn.end'; player: PlayerId }
  | { event: 'phase.start' | 'phase.end'; player: PlayerId; phase: TurnPhase }
  | {
      event: 'card.play';
      source: PlayerId;
      cards: CardId[];
      targets: PlayerId[];
      effectKey: string;
    }
  | {
      event: 'card.target';
      source: PlayerId;
      target: PlayerId;
      effectKey: string;
      cards: CardId[];
    }
  | { event: 'card.lost'; player: PlayerId; cards: CardId[]; from: 'hand' | 'equip' | 'judgementZone' }
  | { event: 'card.gained'; player: PlayerId; count: number }
  | { event: 'demand.open'; from: PlayerId; kind: string; count: number }
  /** The in-flight damage is G.damage, NOT the payload — a listener patches it
   * with {t:'setDamage'} and never retro-edits a frame (§2.1). */
  | { event: 'damage.before' }
  | {
      event: 'damage.after';
      source: PlayerId | null;
      target: PlayerId;
      amount: number;
      kind: DamageKind;
      card?: CardId;
      /** The damage instance (state.ts's DamageInfo.seq) — the scope of the
       * `once_per_damage` limit (4.1 §3.5). */
      seq: number;
    }
  | { event: 'heal.after'; target: PlayerId; source: PlayerId | null; amount: number; card?: CardId }
  | { event: 'strike.hit' | 'strike.dodged'; source: PlayerId; target: PlayerId; card: CardId }
  | { event: 'judge.card' | 'judge.result'; target: PlayerId; reasonKey: string }
  | { event: 'dying'; target: PlayerId }
  | { event: 'death'; target: PlayerId; killer: PlayerId | null };

/**
 * Every event name, derived from the payload union so the two cannot drift.
 * skill-trigger-design §2's emission table is authoritative: **an event that
 * isn't in TriggerEvent doesn't exist**, and adding one is a design change, not
 * an implementation detail, because §3's ordering guarantees are stated
 * relative to it.
 *
 * 4.1b deleted `dodge.used`/`dodge.missing` (superseded by `demand.open` +
 * `strike.hit`/`strike.dodged`) and `hp.change` (never had a payload, so no
 * listener could ever have been written against it).
 */
export type EngineEvent = TriggerEvent['event'];

/**
 * Where a card can be. The `{t:'moveCards'}` primitive (3.1 §4) is the only
 * thing in the engine that moves a card between two of these, which is what
 * keeps CardEffect.resolve() free of G mutation (engine-design §3).
 */
export type Zone =
  | { z: 'hand' | 'equip' | 'judgementZone'; player: PlayerId }
  | { z: 'discard' | 'drawPile' | 'revealed' };

export type Frame =
  | { t: 'phase'; phase: TurnPhase } // run one of the 6 phases
  | { t: 'play'; source: PlayerId; cards: CardId[]; targets: PlayerId[]; effectKey: string }
  | { t: 'effect'; effectKey: string; ctx: EffectCtx } // one step of a card/skill effect
  | { t: 'request'; req: PendingRequest } // block on a player's answer
  // A TWO-STEP window (4.1 §2.1), not an atomic hit. Step 1 (windowOpen unset)
  // publishes the damage to G.damage and opens `damage.before`; step 2 (the
  // engine re-pushes this same frame with windowOpen) applies whatever survived
  // the window and fires `damage.after`. The flag is what lets step 1 ASSERT
  // that no other window is already open, instead of silently nesting.
  | {
      t: 'damage';
      source: PlayerId | null;
      target: PlayerId;
      amount: number;
      kind: DamageKind;
      card?: CardId;
      windowOpen?: true;
    }
  /** The one channel a `damage.before` listener may change the damage through
   * (裸衣 +1 · 青釭剑 ignoreArmour · 寒冰剑/仁王盾 prevented). Patches G.damage —
   * the exact analogue of {t:'retrial'} patching G.judgement. */
  | { t: 'setDamage'; patch: Partial<DamageInfo> }
  // Not in the original 2.1 sketch — added in task 2.4. §2's "resolve()
  // returns frames, never mutates G directly" rule means a heal (桃) can't
  // just poke G.players[x].hp from inside CardEffect.resolve(); it needs a
  // frame of its own, same shape as 'damage'.
  | { t: 'heal'; target: PlayerId; amount: number; card?: CardId; source?: PlayerId | null }
  // ── judgement (3.1 §1) ────────────────────────────────────────────────
  // 'judge' flips the top card into the public G.judgement field and opens
  // the retrial window; 'judgeResult' reads whatever survived that window,
  // discards it, and dispatches `onResult` through the effect registry.
  | {
      t: 'judge';
      target: PlayerId;
      reasonKey: string;
      onResult: string /* effectKey */;
      card?: CardId;
    }
  | {
      t: 'judgeResult';
      target: PlayerId;
      reasonKey: string;
      onResult: string /* effectKey */;
      card?: CardId;
    }
  /** 改判 (鬼才/鬼道, Phase 4): replace the in-flight judgement card. */
  | { t: 'retrial'; source: PlayerId; card: CardId }
  // ── dying (§5). `killer` is threaded from the damage frame so Phase 5's
  // reward/penalty (Lord kills a Loyalist ⇒ discards everything) doesn't have
  // to re-derive it long after the fact. Nothing in Phase 3 reads it.
  // `notified` is false the first time the window opens (offset 0) and true on
  // every re-entry: the `dying` event fires exactly once per window (§2), and a
  // frame that has already announced itself must not announce itself again.
  | {
      t: 'dying';
      target: PlayerId;
      asker: PlayerId;
      offset: number;
      killer: PlayerId | null;
      notified?: boolean;
    }
  // ── triggers (4.1 §3; the mechanism ships here in 3.2) ─────────────────
  // 'trigger' fans out: it collects live listeners, sorts them ONCE, and
  // pushes one 'triggerStep' per listener. Each step re-checks eligibility
  // when it pops — the snapshot fixes the *order*, live state fixes
  // *eligibility* (4.1 §3.3). They are not the same rule.
  // `order` carries the answers to any {kind:'orderTriggers'} request this
  // fan-out already had to ask (§3.1 step 3: a player with two eligible
  // triggers on one event chooses the order themselves — it must never be
  // resolved silently by registration order). Keyed by owner.
  | { t: 'trigger'; ev: TriggerEvent; order?: Record<PlayerId, string[]> }
  // `confirmed` is set by the respondSkill move: an OPTIONAL trigger pushes a
  // 'confirmSkill' request and stops; a "yes" re-pushes this same step with the
  // flag, which is also when its once_per_turn/phase counter is spent —
  // declining an optional skill must not consume its limit (§3.4/§3.5).
  | { t: 'triggerStep'; ev: TriggerEvent; owner: PlayerId; triggerId: string; confirmed?: boolean }
  // ── the card-demand protocol (4.1 §5) ─────────────────────────────────
  // "Give me a card of kind K, or don't." The demander pushes
  // [demand, resume] and reads ctx.supplied on the way back.
  // The three-frame sequence is {demand} → [{trigger demand.open}, {demandAsk},
  // {demandClose}] (§12.2). The demand itself lives in G.demand while it's in
  // flight, so a proxy supplier (护驾/激将) can answer it from inside its own
  // frames; demandClose is what hands the answer back to the demander's resume
  // ctx as `supplied`.
  | {
      t: 'demand';
      kind: string;
      /** Who is asked. */
      from: PlayerId;
      /** Who asks, when a player does — 无双's demandCount folds over them. */
      by: PlayerId | null;
      count: number;
      reasonKey: string;
      /** Who the demand is *about* (the dying player a 桃 is asked for).
       * Display-only; reaches the prompt through the request. */
      subject?: PlayerId;
    }
  /** Fold `demandCount`, check the asked player CAN answer, and ask only then —
   * *after* the demand.open fan-out, so a proxy or a deemed card can make an
   * otherwise un-answerable demand answerable (§12.2). */
  | { t: 'demandAsk' }
  /** Read G.demand.supplied, clear it, hand it to the demander's resume ctx. */
  | { t: 'demandClose' }
  /** Task 3.6's one addition to the demand protocol: the sanctioned mutation
   * channel for a `demand.open` listener that DEEMS the demand answered
   * without a card leaving anyone's hand — 八卦阵's judgement becoming a 闪 is
   * the only Standard user. A CardEffect/SkillTrigger may never mutate G
   * directly (engine-design §3); this is the {t:'setDamage'}/{t:'retrial'}
   * pattern's third instance. `cards: []` is a valid DEEMED answer — see
   * DemandInfo.supplied's own doc comment on why `[]` and `null` are not the
   * same thing. Asserts a demand is actually open; {t:'demandAsk'} is what
   * reads the result afterwards and skips asking when it sees non-null. */
  | { t: 'demandSupply'; cards: CardId[] }
  // ── primitives (3.1 §4). Three, plus 3.4's two additions below. ────────
  | { t: 'moveCards'; cards: CardId[]; from: Zone; to: Zone; by?: PlayerId }
  | { t: 'draw'; player: PlayerId; count: number }
  | { t: 'skipPhase'; phase: TurnPhase }
  /** 3.4's reveal-primitive design call (五谷丰登, CONTINUE.md/3.3's handoff):
   * takes `count` cards off the TOP of the draw pile into the public
   * G.revealed pool, reshuffling the discard pile in if it runs dry — exactly
   * like drawTop()/drawCards(), which is why it needs the engine's `rng` and
   * therefore has to be a primitive rather than something CardEffect.resolve()
   * does itself (engine-design §3: no rng inside resolve()). Chosen over a
   * `count`-carrying variant of `moveCards` because `moveCards` always names
   * the exact ids it's moving — that's what lets an effect return it without
   * touching G — and a reveal can't know those ids in advance; overloading
   * `moveCards` to sometimes resolve its own `cards` from `count` would have
   * split its contract in two depending on which zone it's reading from. */
  | { t: 'reveal'; count: number }
  /** The one sanctioned way for a CardEffect to write G.log (F3, docs/
   * three-kingdoms-plan.md's Phase 3 note) — the `{t:'flag'}` pattern applied
   * to the log instead of turnFlags: dumb, no conditions, no reading. Effects
   * push this alongside whatever frame they're narrating (e.g. next to the
   * `{t:'damage'}` a 决斗 loss produces) rather than mutating G.log directly,
   * which engine-design §3 forbids. `key`/`params` follow client/src/game/
   * log.ts's existing vocabulary — reuse a key from there before inventing one. */
  | { t: 'log'; key: string; params?: Record<string, unknown> }
  // ── phase/turn structure (4.1 §2.2) ───────────────────────────────────
  // A phase is [phase.start trigger, phaseBody]: the body re-reads live state
  // when it pops and does nothing if the phase was skipped *from inside its own*
  // phase.start (突袭 skips the draw it is standing in). The end phase's body
  // pushes {t:'turnEnd'} rather than resetting anything itself, because
  // `turn.end` fires BEFORE turnFlags/skipPhases are reset and before
  // activeSeat moves (§2's emission table).
  | { t: 'phaseBody'; phase: TurnPhase }
  | { t: 'turnEnd' }
  /** The one sanctioned way for content to write turn state (§2.2). Deliberately
   * dumb — no logic, no conditions — and turn-scoped only: an effect or trigger
   * may not mutate G (engine-design §3), but 裸衣 must remember "I drew one
   * fewer" for the rest of the turn, and 仁德 must count the cards it has given
   * away. PlayerState.flags stays empty through Phase 4 (§6). */
  | { t: 'flag'; key: string; value: unknown }
  | { t: 'resume'; effectKey: string; ctx: EffectCtx }; // continuation after a request
