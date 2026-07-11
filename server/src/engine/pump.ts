// The whole engine in one loop. See docs/engine-design.md §2.
//
// resolve() dispatches on frame.t. 'play'/'effect'/'resume' go through the
// effect registry ('play' builds the initial ctx from {source, cards, targets}
// and wraps the play in 无懈可击 windows where the card calls for it);
// 'request', the phase/turn structure, 'damage'/'heal', 'dying', judgement,
// triggers, the card demand protocol and the primitives are generic plumbing
// implemented here.
//
// Task 3.2 added: judgement (3.1 §1), the trigger fan-out (4.1 §3), the
// nullification wrap (3.1 §2), {t:'demand'} (4.1 §5), the moveCards/draw/
// skipPhase primitives (3.1 §4), and the DEAD-SUBJECT RULE (below).
//
// Task 4.1b added the rest of skill-trigger-design's mechanisms, and this file
// now has NO notImplemented calls left in it:
//   * the two-step damage window over the public G.damage (§2.1) + {t:'setDamage'}
//   * the demand rework over the public G.demand (§12.2) — demand.open fans out
//     BEFORE the "can they answer?" check, which is what makes a proxy supplier
//     (护驾/激将) or a deemed card (八卦阵) able to answer at all
//   * the confirmSkill prompt for optional triggers + the engine-enforced limits
//   * {kind:'orderTriggers'} for a player with two eligible triggers on one event
//   * the remaining event emission (turn/phase/card.lost/card.gained/…)
//
// This module must not import boardgame.io — see docs/engine-design.md §8.

import type { CardId, GState, PlayerId } from './state.js';
import type { EffectCtx, Frame, TriggerEvent, Zone } from './frames.js';
import type { CardEffect } from '../content/effectTypes.js';
import type { RNG } from './rng.js';
import { resolvePhase, resolvePhaseBody, endTurn } from './phases.js';
import { askerAtOffset, deathConsequenceFrames, resolveDeath } from './dying.js';
import { checkVictory } from './victory.js';
import { drawCards, drawTop } from './deck.js';
import { ambiguousOrderGroup, fanOut, findTrigger } from './triggers.js';
import { limitSpent, spendLimit } from './limits.js';
import { cardsAs, demandCount } from './queries.js';
import { getCard } from './cardIndex.js';
import { pushFrames, applyToResumeFrame } from './stack.js';
import { effectRegistry } from '../content/effectRegistry.js';
import { skillRegistry } from '../content/skillRegistry.js';
import { nullifyWindowFrame } from '../content/effects/nullifyWindow.js';

// Re-exported so the 2.x call sites (moves, tests) that import them from the
// pump keep working; they live in stack.ts now so phases.ts can use them
// without a circular import.
export { pushFrames, applyToResumeFrame };

/**
 * THE DEAD-SUBJECT RULE (docs/judgement-nullification-design.md §4).
 *
 * engine-design §5: "a death mid-resolution does not cancel the rest of the
 * stack — an AoE that kills player 3 still hits players 4 and 5. Only the
 * frames targeting the dead player are dropped, and the engine does that by
 * checking `alive` when a frame is popped, not by scrubbing the stack."
 *
 * This is that check, in one place instead of copy-pasted into six cases.
 * Returns the player a frame is *about*, or null if it isn't about anyone in
 * particular. 'dying' is deliberately absent: it is the one frame whose whole
 * job is to run for a player at 0 hp.
 */
function subjectOf(frame: Frame): PlayerId | null {
  switch (frame.t) {
    case 'request':
      return frame.req.playerId;
    case 'damage':
    case 'heal':
    case 'judge':
    case 'judgeResult':
      return frame.target;
    case 'demand':
      return frame.from;
    case 'draw':
      return frame.player;
    case 'triggerStep':
      return frame.owner;
    case 'retrial':
      return frame.source;
    default:
      return null;
  }
}

/**
 * An active skill (制衡, 仁德, 观星…) IS a CardEffect — skill-trigger-design §1's
 * third face — so it resolves through exactly the machinery a card does,
 * including multi-step requests and resume frames. It is dispatched under the
 * namespaced key `skill.<id>` (content/skillRegistry.ts's activeEffectKey), so
 * a skill can never collide with a card's effectKey and the registry needs no
 * boot-time mutation.
 */
function findEffect(effectKey: string): CardEffect | undefined {
  if (effectKey.startsWith('skill.')) {
    return skillRegistry[effectKey.slice('skill.'.length)]?.active;
  }
  return effectRegistry[effectKey];
}

function dispatchEffect(effectKey: string, ctx: EffectCtx, G: GState): void {
  const effect = findEffect(effectKey);
  if (!effect) {
    throw new Error(`pump: no registered effect for effectKey '${effectKey}'`);
  }
  pushFrames(G, effect.resolve(G, ctx));
}

/** A `card.lost` emission (4.1 §2's table). Exported because the moves that
 * discard directly — playCard, discard, supplyCards — must emit it too, and
 * deck.ts's discardFromHand is a pure mutation with no stack to push onto.
 * 连营 (hand emptied) and 枭姬 (equipment lost) are the listeners. */
export function cardLostFrame(
  player: PlayerId,
  cards: readonly CardId[],
  from: 'hand' | 'equip' | 'judgementZone',
): Frame {
  return { t: 'trigger', ev: { event: 'card.lost', player, cards: [...cards], from } };
}

// ── zone plumbing for the {t:'moveCards'} primitive (3.1 §4) ──────────────

const EQUIP_SLOTS = ['weapon', 'armour', 'plusHorse', 'minusHorse'] as const;
type EquipSlot = (typeof EQUIP_SLOTS)[number];

/** Which of the four slots a piece of equipment belongs in. Data, not a
 * switch: cards.json carries `equipmentType`/`horseDirection` (task 1.x). */
function slotFor(cardId: CardId): EquipSlot {
  const card = getCard(cardId);
  if (card.equipmentType === 'weapon') return 'weapon';
  if (card.equipmentType === 'armour') return 'armour';
  if (card.equipmentType === 'horse') {
    // horseDirection is +1 / -1 in cards.json (task 1.x), not a word.
    return card.horseDirection === 1 ? 'plusHorse' : 'minusHorse';
  }
  throw new Error(`moveCards: '${cardId}' is not equipment and cannot go in an equip zone`);
}

function takeFromZone(G: GState, zone: Zone, cards: readonly CardId[]): void {
  switch (zone.z) {
    case 'hand': {
      const player = G.players[zone.player];
      for (const id of cards) {
        const i = player.hand.indexOf(id);
        if (i === -1) throw new Error(`moveCards: ${zone.player} does not hold ${id}`);
        player.hand.splice(i, 1);
      }
      return;
    }
    case 'equip': {
      const player = G.players[zone.player];
      for (const id of cards) {
        const slot = slotFor(id);
        if (player.equipment[slot] !== id) {
          throw new Error(`moveCards: ${zone.player} does not have ${id} equipped`);
        }
        player.equipment[slot] = null;
      }
      return;
    }
    case 'judgementZone': {
      const player = G.players[zone.player];
      for (const id of cards) {
        const i = player.judgementZone.indexOf(id);
        if (i === -1) throw new Error(`moveCards: ${id} is not in ${zone.player}'s judgement zone`);
        player.judgementZone.splice(i, 1);
      }
      return;
    }
    case 'discard': {
      for (const id of cards) {
        const i = G.discardPile.indexOf(id);
        if (i === -1) throw new Error(`moveCards: ${id} is not in the discard pile`);
        G.discardPile.splice(i, 1);
      }
      return;
    }
    case 'drawPile': {
      for (const id of cards) {
        const i = G.drawPile.indexOf(id);
        if (i === -1) throw new Error(`moveCards: ${id} is not in the draw pile`);
        G.drawPile.splice(i, 1);
      }
      return;
    }
    case 'revealed':
      // The 五谷丰登 pool (3.4). Cards sit in G.discardPile-adjacent limbo only
      // for the length of one effect, so there is nothing to take them from
      // yet — 3.4 adds the field when it adds the card.
      throw new Error("moveCards: the 'revealed' zone is not implemented until task 3.4 (五谷丰登)");
  }
}

function putInZone(G: GState, zone: Zone, cards: readonly CardId[]): void {
  switch (zone.z) {
    case 'hand':
      G.players[zone.player].hand.push(...cards);
      return;
    case 'equip': {
      const player = G.players[zone.player];
      for (const id of cards) {
        const slot = slotFor(id);
        const replaced = player.equipment[slot];
        // Equipping into an occupied slot discards what was there (plan §3.3).
        if (replaced) G.discardPile.push(replaced);
        player.equipment[slot] = id;
      }
      return;
    }
    case 'judgementZone':
      G.players[zone.player].judgementZone.push(...cards);
      return;
    case 'discard':
      G.discardPile.push(...cards);
      return;
    case 'drawPile':
      G.drawPile.unshift(...cards); // index 0 = top (state.ts)
      return;
    case 'revealed':
      throw new Error("moveCards: the 'revealed' zone is not implemented until task 3.4 (五谷丰登)");
  }
}

/** PURE-ish: mutates G, and may push new frames or set G.pending. */
export function resolve(frame: Frame, G: GState, rng: RNG): void {
  // The dead-subject rule, applied once for every frame type that has a
  // subject (see subjectOf). This is also half of the F1 fix — the other half
  // is engine/dying.ts's endTurnIfTurnPlayerDied().
  const subject = subjectOf(frame);
  if (subject !== null && !G.players[subject]?.alive) return;

  switch (frame.t) {
    // ── the turn structure (docs/skill-trigger-design.md §2.2) ────────────

    case 'phase':
      resolvePhase(frame.phase, G);
      return;

    case 'phaseBody':
      resolvePhaseBody(frame.phase, G);
      return;

    case 'turnEnd':
      // Pops AFTER phase.end(end) and turn.end have fanned out — which is the
      // whole reason it exists as a frame rather than as the tail of the end
      // phase: §2's emission table puts turn.end *before* turnFlags/skipPhases
      // are reset and before activeSeat moves, and a listener that reads a
      // turn flag the engine has already wiped reads a lie.
      endTurn(G);
      return;

    case 'flag':
      // The one sanctioned way for content to write turn state (§2.2).
      // Deliberately dumb: no logic, no conditions, no reading. 裸衣 records
      // "I drew one fewer"; 仁德 counts the cards it has given away.
      G.turnFlags[frame.key] = frame.value;
      return;

    case 'request':
      // A frame that needs a player decision sets G.pending and stops; the
      // frame that pushed this one is responsible for also pushing whatever it
      // needs to resume once the answer comes in (docs/engine-design.md §2).
      G.pending = frame.req;
      return;

    case 'play': {
      const ctx: EffectCtx = { source: frame.source, cards: frame.cards, targets: frame.targets };
      const effect = findEffect(frame.effectKey);
      if (!effect) throw new Error(`pump: no registered effect for effectKey '${frame.effectKey}'`);

      // 无懈可击 wrapping (docs/judgement-nullification-design.md §2.2). The
      // default is per card *type*, so no basic card or equipment ever has to
      // say anything, and a new trick is nullifiable unless it opts out.
      const cardType = getCard(frame.cards[0]).type;
      const mode = effect.nullify ?? (cardType === 'trick' ? 'once' : 'none');
      const reasonKey = `nullify.${frame.effectKey}`;

      const frames: Frame[] = [
        {
          t: 'trigger',
          ev: {
            event: 'card.play',
            source: frame.source,
            cards: frame.cards,
            targets: frame.targets,
            effectKey: frame.effectKey,
          },
        },
      ];
      if (mode === 'per_target') {
        // One INDEPENDENT window per target: a 无懈可击 on a 3-target 南蛮入侵
        // saves one player; the other two still have to answer.
        for (const target of frame.targets) {
          frames.push(
            nullifyWindowFrame(
              { t: 'effect', effectKey: frame.effectKey, ctx: { ...ctx, targets: [target] } },
              reasonKey,
            ),
          );
        }
      } else if (mode === 'once') {
        frames.push(nullifyWindowFrame({ t: 'effect', effectKey: frame.effectKey, ctx }, reasonKey));
      } else {
        // 'none' (basics, equipment) and 'custom' (五谷丰登 wraps its own).
        frames.push({ t: 'effect', effectKey: frame.effectKey, ctx });
      }
      pushFrames(G, frames);
      return;
    }

    case 'effect':
    case 'resume':
      dispatchEffect(frame.effectKey, frame.ctx, G);
      return;

    // ── the damage window (docs/skill-trigger-design.md §2.1) ─────────────
    //
    // TWO STEPS over the public G.damage, exactly mirroring 3.1's G.judgement.
    // The obvious implementation — push [trigger, damage] and let listeners
    // edit the damage frame sitting underneath them — is FORBIDDEN: an effect
    // returns frames and never mutates G (engine-design §3), a listener that
    // reaches down the stack to rewrite a frame it didn't push breaks the one
    // property that keeps effects from corrupting each other, and it is the
    // stale-continuation trap this codebase has already been burned by twice
    // (2.6, 3.1 §2.1).
    //
    // A pure synchronous fold instead of an event was considered and rejected:
    // 寒冰剑 (optional, blocking, damage-preventing) falsifies it, because a
    // fold cannot stop and ask.

    case 'damage': {
      const target = G.players[frame.target];

      if (!frame.windowOpen) {
        // Step 1 — open the window. Nothing is applied yet.
        if (G.damage) {
          throw new Error(
            `pump: damage on '${frame.target}' opened while a damage window on ` +
              `'${G.damage.target}' is still in flight. Nothing in Standard deals damage from ` +
              `inside a damage.before listener (刚烈's counter-damage is damage.after, by which ` +
              `time the window is closed) — if an expansion breaks this, G.damage becomes a small ` +
              `stack and nothing else changes (docs/skill-trigger-design.md §2.1).`,
          );
        }
        G.damage = {
          source: frame.source,
          target: frame.target,
          amount: frame.amount,
          kind: frame.kind,
          ...(frame.card === undefined ? {} : { card: frame.card }),
          seq: nextDamageSeq(G),
        };
        pushFrames(G, [
          { t: 'trigger', ev: { event: 'damage.before' } },
          { ...frame, windowOpen: true },
        ]);
        return;
      }

      // Step 2 — apply whatever survived the window.
      const d = G.damage;
      if (!d) {
        throw new Error("pump: a second-step 'damage' frame popped with no damage window open");
      }
      G.damage = null;
      if (d.prevented || d.amount <= 0) return; // 寒冰剑 / 仁王盾
      target.hp -= d.amount;
      // hp is intentionally not clamped at 0 — the dying window decides what
      // happens next; a 桃 mid-window can bring it back above 0 without
      // needing to know how far below it went.
      pushFrames(G, [
        {
          t: 'trigger',
          ev: {
            event: 'damage.after',
            source: d.source,
            target: d.target,
            amount: d.amount,
            kind: d.kind,
            ...(d.card === undefined ? {} : { card: d.card }),
            seq: d.seq,
          },
        },
        // 奸雄/反馈/刚烈/遗计 all fire BEFORE the dying window opens (§2's
        // table: "after hp is decremented, before the dying check") — which is
        // what lets 刚烈's counter-damage and 遗计's draw resolve while their
        // owner is still at 0 hp and not yet dead.
        ...(target.hp <= 0
          ? [
              {
                t: 'dying' as const,
                target: d.target,
                asker: d.target,
                offset: 0,
                killer: d.source,
              },
            ]
          : []),
      ]);
      return;
    }

    case 'setDamage': {
      // The mutation channel for a damage.before listener — the exact analogue
      // of {t:'retrial'} patching G.judgement.
      if (!G.damage) {
        throw new Error("pump: a 'setDamage' frame popped with no damage window open");
      }
      G.damage = { ...G.damage, ...frame.patch };
      return;
    }

    case 'heal': {
      const target = G.players[frame.target];
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + frame.amount);
      G.stack.push({
        t: 'trigger',
        ev: {
          event: 'heal.after',
          target: frame.target,
          source: frame.source ?? null,
          amount: target.hp - before,
          ...(frame.card === undefined ? {} : { card: frame.card }),
        },
      });
      return;
    }

    // ── judgement (docs/judgement-nullification-design.md §1) ─────────────

    case 'judge': {
      // Flip the top card. It is public from this instant — lifted OUT of the
      // draw pile into G.judgement rather than peeked in place, because §6's
      // rule is delete hidden zones, never mask them.
      const cardId = drawTop(G, rng);
      G.judgement = {
        target: frame.target,
        cardId,
        reasonKey: frame.reasonKey,
        sourceCard: frame.card,
      };
      // Narrative order: the retrial window (an ordinary trigger fan-out — so
      // 鬼才 is an ordinary skill and judgement needs no bespoke machinery),
      // then read whatever survived it.
      pushFrames(G, [
        { t: 'trigger', ev: { event: 'judge.card', target: frame.target, reasonKey: frame.reasonKey } },
        { ...frame, t: 'judgeResult' },
      ]);
      return;
    }

    case 'judgeResult': {
      const judgement = G.judgement;
      if (!judgement) {
        throw new Error("pump: a 'judgeResult' frame popped with no judgement in flight");
      }
      G.judgement = null;
      G.discardPile.push(judgement.cardId); // 判定牌在判定结果结算后弃置
      pushFrames(G, [
        { t: 'trigger', ev: { event: 'judge.result', target: frame.target, reasonKey: frame.reasonKey } },
        {
          t: 'effect',
          effectKey: frame.onResult,
          ctx: {
            target: frame.target,
            judgeCard: judgement.cardId,
            sourceCard: judgement.sourceCard,
          },
        },
      ]);
      return;
    }

    case 'retrial': {
      // 改判: the replacement IS the judgement card now. The old one is
      // discarded immediately, and the window re-opens — retrials chain (a
      // second retrial skill may answer the first).
      const judgement = G.judgement;
      if (!judgement) {
        throw new Error("pump: a 'retrial' frame popped with no judgement in flight");
      }
      G.discardPile.push(judgement.cardId);
      judgement.cardId = frame.card;
      G.stack.push({
        t: 'trigger',
        ev: { event: 'judge.card', target: judgement.target, reasonKey: judgement.reasonKey },
      });
      return;
    }

    // ── triggers (docs/skill-trigger-design.md §3) ────────────────────────

    case 'trigger': {
      // Collect → sort ONCE → push one step per listener. The snapshot fixes
      // the order; eligibility is re-derived per step below.
      //
      // §3.1 step 3: if one owner has two eligible triggers at the same
      // priority on this event, THE OWNER CHOOSES THE ORDER. Rare in Standard
      // (no general has two triggers on one event; it becomes reachable when a
      // skill and an equipment trigger collide) and cold by construction — but
      // it must never be resolved silently by registration order, because that
      // is a rules bug that first shows up in an expansion, when nobody
      // remembers this code.
      const ambiguous = ambiguousOrderGroup(G, frame.ev, frame.order);
      if (ambiguous) {
        G.stack.push({
          t: 'request',
          req: {
            kind: 'orderTriggers',
            playerId: ambiguous.owner,
            triggerIds: ambiguous.triggerIds,
            ev: frame.ev,
            order: frame.order ?? {},
          },
        });
        return; // the orderTriggers move re-pushes this fan-out with the answer
      }
      pushFrames(G, fanOut(G, frame.ev, frame.order));
      return;
    }

    case 'triggerStep': {
      // §3.3: re-check at pop time. The owner may have died, lost the
      // equipment that granted this trigger, or had their when() falsified by
      // an earlier listener in this same fan-out. (Owner-alive is already
      // covered by the dead-subject rule above.)
      const trigger = findTrigger(G, frame.owner, frame.triggerId);
      if (!trigger) return;
      if (!trigger.when(frame.ev, G, frame.owner)) return;
      // §3.5: the limit is the ENGINE's, never the skill's when().
      if (limitSpent(G, frame.triggerId, trigger.limit, frame.ev)) return;

      if (trigger.optional && !frame.confirmed) {
        // §3.4: an optional trigger costs exactly one request. The answer does
        // not come back through a resume frame — the respondSkill move pushes
        // this same step back with `confirmed` on a "yes", and pushes nothing
        // at all on a "no", which is the same shape the dying window uses.
        G.stack.push({
          t: 'request',
          req: {
            kind: 'confirmSkill',
            playerId: frame.owner,
            triggerId: frame.triggerId,
            labelKey: trigger.labelKey ?? frame.triggerId,
            ev: frame.ev,
          },
        });
        return;
      }

      // Spent only now — declining an optional skill must not consume its
      // once-per-turn.
      spendLimit(G, frame.triggerId, trigger.limit, frame.ev);
      pushFrames(G, trigger.effect(frame.ev, G, frame.owner));
      return;
    }

    // ── the card-demand protocol (docs/skill-trigger-design.md §5, §12.2) ──
    //
    // "Give me `count` cards of kind `kind`, or don't." The demander pushes
    // [demand, resume] and reads ctx.supplied on the way back.
    //
    // THE ORDER OF THE THREE FRAMES IS THE WHOLE POINT. 3.2 shipped this with
    // the "can they even answer?" hand-filter running BEFORE the demand.open
    // fan-out, and handed the wart back explicitly: a proxy supplier (护驾 — a
    // Wei player answers for the lord) or a deemed-card producer (八卦阵 — a
    // judgement *becomes* a 闪) can make an un-answerable demand answerable, and
    // an engine that has already decided not to ask can never learn that.

    case 'demand': {
      if (G.demand) {
        throw new Error(
          `pump: a demand (${G.demand.kind} from ${G.demand.from}) is already in flight. ` +
            `No Standard skill nests one demand inside another — a proxy (护驾/激将/急救) pushes a ` +
            `plain demandCard request at its ally and writes G.demand.supplied, it does not open a ` +
            `second demand (docs/skill-trigger-design.md §12.2).`,
        );
      }
      G.demand = {
        kind: frame.kind,
        from: frame.from,
        by: frame.by,
        count: frame.count,
        reasonKey: frame.reasonKey,
        ...(frame.subject === undefined ? {} : { subject: frame.subject }),
        supplied: null,
      };
      pushFrames(G, [
        { t: 'trigger', ev: { event: 'demand.open', from: frame.from, kind: frame.kind, count: frame.count } },
        { t: 'demandAsk' },
        { t: 'demandClose' },
      ]);
      return;
    }

    case 'demandAsk': {
      const d = G.demand;
      if (!d) throw new Error("pump: a 'demandAsk' frame popped with no demand in flight");
      if (d.supplied !== null) return; // a proxy or a deemed card already answered it

      const from = G.players[d.from];
      if (!from?.alive) return; // died inside the demand.open fan-out ⇒ not supplied

      // 无双 ⇒ 2. Read here, not baked in by the demander (§12.2), so a skill
      // that multiplies a demand doesn't have to be known to every effect that
      // raises one.
      if (d.by !== null) d.count = demandCount(G, d.by, d.kind, d.count);

      // Can they answer at all? Folded through queries.cardsAs, which is what
      // lets 武圣 answer a 'strike' demand with a red card and 急救 answer a
      // 'peach' demand with any red one. Can't answer ⇒ don't ask: the server
      // knows every hand, so an un-answerable prompt is a wasted round-trip,
      // not fairness (the same call dying.ts made in 2.6 and 3.1 §2.1 makes for
      // nullification askers).
      const candidates = from.hand.filter((id) => cardsAs(G, d.from, [getCard(id)], d.kind));
      if (candidates.length < d.count) return;

      G.stack.push({
        t: 'request',
        req: {
          kind: 'demandCard',
          playerId: d.from,
          demandKind: d.kind,
          count: d.count,
          reasonKey: d.reasonKey,
          ...(d.subject === undefined ? {} : { subject: d.subject }),
        },
      });
      return;
    }

    case 'demandClose': {
      const d = G.demand;
      if (!d) throw new Error("pump: a 'demandClose' frame popped with no demand in flight");
      G.demand = null;
      // By the time this pops, the demander's own `resume` frame is back on
      // top — every frame the demand pushed above it has drained.
      //
      // `supplied: []` is NOT `null`: an empty array is "answered, with no
      // card" (a deemed 闪 from 八卦阵), null is "not answered."
      applyToResumeFrame(G, { supplied: d.supplied });
      return;
    }

    // ── the three primitives (docs/judgement-nullification-design.md §4) ──

    case 'moveCards': {
      takeFromZone(G, frame.from, frame.cards);
      putInZone(G, frame.to, frame.cards);
      const frames: Frame[] = [];
      if (frame.from.z === 'hand' || frame.from.z === 'equip' || frame.from.z === 'judgementZone') {
        frames.push(cardLostFrame(frame.from.player, frame.cards, frame.from.z));
      }
      if (frame.to.z === 'hand') {
        frames.push({
          t: 'trigger',
          ev: { event: 'card.gained', player: frame.to.player, count: frame.cards.length },
        });
      }
      pushFrames(G, frames);
      return;
    }

    case 'draw': {
      const drawn = drawCards(G, frame.player, frame.count, rng);
      if (drawn.length > 0) {
        G.stack.push({
          t: 'trigger',
          ev: { event: 'card.gained', player: frame.player, count: drawn.length },
        });
      }
      return;
    }

    case 'skipPhase':
      if (!G.skipPhases.includes(frame.phase)) G.skipPhases.push(frame.phase);
      return;

    // ── the dying window (docs/engine-design.md §5) ───────────────────────

    case 'dying': {
      // Re-checked every time this frame is popped, not just when it's first
      // pushed — a 桃 played two frames ago (or a 急救 supplied by someone
      // else) must end the window immediately.
      const target = G.players[frame.target];
      if (!target || !target.alive || target.hp > 0) return;

      // The `dying` event fires exactly once per window (§2's table: "once,
      // when the window opens"), before anyone is asked for a 桃. Re-enter to
      // do the asking, so that a listener which heals the target closes the
      // window on the re-entry's own hp check rather than being raced by it.
      if (!frame.notified) {
        pushFrames(G, [
          { t: 'trigger', ev: { event: 'dying', target: frame.target } },
          { ...frame, notified: true },
        ]);
        return;
      }

      const asker = askerAtOffset(G, frame.target, frame.offset);
      if (asker === null) {
        // Offset has walked past every living player, including the dying
        // player themselves at offset 0 — nobody saved them.
        resolveDeath(G, frame.target, frame.killer);

        // A death is the only thing in Standard that can end a game (task 5.3),
        // and pump()'s own loop condition halts on G.gameOver — so this is what
        // stops the engine. Checked BEFORE the 奖惩 payout: a bounty drawn into
        // a finished game is noise, and the frame would never resolve anyway.
        if (checkVictory(G)) return;

        pushFrames(G, [
          { t: 'trigger', ev: { event: 'death', target: frame.target, killer: frame.killer } },
          ...deathConsequenceFrames(G, frame.target, frame.killer),
        ]);
        return;
      }

      // Ask through the demand protocol (§5) rather than a bespoke
      // respondPeach stage: that stage is what 4.1b deleted, and asking this
      // way is the only reason 华佗's 急救 (any red card, as a 桃, for someone
      // else) can exist at all. dying.ts keeps the asker ORDERING — that is a
      // rule, not a demand — and hands the round-trip to the demand.
      //
      // Note there is no "does this asker even hold a 桃?" check here any
      // more: {t:'demandAsk'} makes exactly that call, through the cardsAs
      // fold, which is where a skill can widen what counts as an answer.
      pushFrames(G, [
        {
          t: 'demand',
          kind: 'peach',
          from: asker,
          by: null,
          count: 1,
          reasonKey: 'demand.peach',
          subject: frame.target,
        },
        {
          t: 'resume',
          effectKey: 'dying_window',
          ctx: {
            target: frame.target,
            asker,
            offset: frame.offset,
            killer: frame.killer,
          },
        },
      ]);
      return;
    }
  }
}

/** Monotonic within a turn — the scope of the `once_per_damage` trigger limit
 * (engine/limits.ts). turnFlags are wiped by {t:'turnEnd'}, and a damage
 * instance never outlives the turn that dealt it. */
function nextDamageSeq(G: GState): number {
  const seq = ((G.turnFlags.damageSeq as number | undefined) ?? 0) + 1;
  G.turnFlags.damageSeq = seq;
  return seq;
}

/**
 * The whole engine in one loop (docs/engine-design.md §2). Runs until the
 * engine is blocked on a player's answer (G.pending is set), the stack empties,
 * or the game ends.
 */
export function pump(G: GState, rng: RNG): void {
  while (!G.pending && G.stack.length && !G.gameOver) {
    const frame = G.stack.pop();
    if (!frame) break; // unreachable given the length check, but keeps TS's strict null checks happy
    resolve(frame, G, rng);
  }
}

/** Re-exported for the moves: `{t:'trigger'}` frames they push directly. */
export type { TriggerEvent };
