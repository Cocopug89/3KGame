// The boardgame.io adapter (task 2.3, engine-design.md §7-§8): thin glue
// between the framework and the engine. Uses boardgame.io for exactly two
// things — `turn` (= one 回合) and `stages`/`activePlayers`, both driven off
// `G.pending` after every pump() call. No rules live here; every move is
// "validate the answer server-side, apply it, pump, re-sync bgio".
//
// Real general selection is task 5.2 — setup() here takes a placeholder
// `generalIds` map (or assigns the first N generals deterministically if
// omitted) purely so the turn loop has something to run against.

import type { Game } from 'boardgame.io';
// Deep import — Node ESM can't do a bare directory import of
// `boardgame.io/core` (no "exports" map on this package; same issue as the
// server's own `boardgame.io/server` import, see boardgame-io-server.d.ts).
import { INVALID_MOVE } from 'boardgame.io/dist/cjs/core.js';
import { generals, STAGE_CHOOSE_GENERAL, THREE_KINGDOMS_GAME_NAME } from '@3k/shared';
import type { CardId, GState, PlayerId } from '../engine/state.js';
import { completeSelection, initGame, initSelection } from '../engine/setup.js';
import { applyPick, isSelectionComplete } from '../engine/selection.js';
import { pump, pushFrames, applyToResumeFrame, cardLostFrame } from '../engine/pump.js';
import { resolveSlot, type CardSlot } from '../engine/cardChoice.js';
import { discardFromHand } from '../engine/deck.js';
import { endOfPhaseFrames } from '../engine/phases.js';
import { getCard } from '../engine/cardIndex.js';
import type { CardDef } from '../engine/cardIndex.js';
import { inAttackRange, distance } from '../engine/distance.js';
import { cardsAs, ignoresDistance, targetLimit, targetable } from '../engine/queries.js';
import { activeLimitKey } from '../engine/limits.js';
import type { Frame, TriggerEvent } from '../engine/frames.js';
import { effectRegistry } from '../content/effectRegistry.js';
import type { CardEffect, TargetSpec } from '../content/effectTypes.js';
import { activeEffectKey, skillRegistry } from '../content/skillRegistry.js';
import { skillsOfPlayer } from '../content/skillSource.js';
import { makeRng, type BgioRandomLike } from './rng.js';

export interface ThreeKingdomsSetupData {
  /** Run the real general-selection window first (task 5.2): roles are dealt,
   * the Lord is revealed and picks from a wider pool, then everyone else picks
   * simultaneously, and only then are hands dealt and turn 1 started. This is
   * what the lobby passes for a real match (server/src/lobby/rooms.ts).
   *
   * It's opt-in rather than the default because the other two callers — the
   * integration tests and the UI fixtures — want a *specific* dealt table, not
   * a selection window they'd have to click through before they can assert
   * anything. */
  selectGenerals?: boolean;
  /** One general id per player id. Ignored when `selectGenerals` is set (the
   * players choose). If both are omitted, the first N generals in
   * content/standard/generals.json are assigned in player order. */
  generalIds?: Record<PlayerId, string>;
}

function defaultGeneralIds(playerIds: readonly PlayerId[]): Record<PlayerId, string> {
  if (playerIds.length > generals.length) {
    throw new Error(
      `defaultGeneralIds: only ${generals.length} generals available for ${playerIds.length} players`,
    );
  }
  const assignment: Record<PlayerId, string> = {};
  playerIds.forEach((id, i) => {
    assignment[id] = generals[i].id;
  });
  return assignment;
}

/**
 * Keeps boardgame.io's own bookkeeping in sync with the engine after every
 * pump() call — the engine drives all player-switching itself via
 * G.activeSeat/G.pending, never boardgame.io's `events` API directly
 * (engine-design §7, §8); this is the one place that translates engine
 * state into bgio events. Called at the end of every move and once from
 * setup().
 */
function activePlayersFor(G: GState): Record<PlayerId, string> | null {
  // Selection (task 5.2) is the one window with more than one player in it at
  // a time — the Lord alone first, then everyone else simultaneously. It maps
  // straight onto activePlayers, which is already multi-player; G.pending
  // (single-valued by design) is not involved.
  if (G.selection) {
    return Object.fromEntries(G.selection.awaiting.map((id) => [id, STAGE_CHOOSE_GENERAL]));
  }
  if (G.pending) {
    return { [G.pending.playerId]: G.pending.kind };
  }
  return null;
}

function syncBgio(
  G: GState,
  ctx: { currentPlayer: PlayerId },
  events: {
    setActivePlayers: (arg: { value: Record<PlayerId, string> }) => void;
    endTurn: (arg?: { next: PlayerId }) => void;
  },
): void {
  const activePlayerId = G.seats[G.activeSeat];
  if (activePlayerId !== ctx.currentPlayer) {
    // Also how turn 1 lands on the Lord rather than seat 0 once selection
    // completes: completeSelection() moves G.activeSeat, and this is what
    // tells boardgame.io about it.
    events.endTurn({ next: activePlayerId });
  }
  const active = activePlayersFor(G);
  if (active) {
    events.setActivePlayers({ value: active });
  }
}

/**
 * F2 (docs/phase-2-review.md), fixed in 4.1b: `playerView` used to spread every
 * player's whole `flags` object to every client, though engine-design §6 says
 * only `pub.*` keys are public. It was harmless only for as long as `flags`
 * stayed empty — so the filter goes in NOW, before the first skill that ever
 * needs per-player state can leak it by default.
 *
 * (Skill state through Phase 4 is turn-scoped and lives in G.turnFlags, which
 * IS public — a turn flag records something the table watched happen: 裸衣's
 * choice, 仁德's gifts, which limits have been spent. PlayerState.flags stays
 * empty; this is the guard rail for whatever fills it first.)
 */
function publicFlags(flags: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(flags).filter(([key]) => key.startsWith('pub.')));
}

/** playerView per docs/engine-design.md §6. This is a good-faith first pass
 * (drawPile/stack deleted, other players' hands/roles stripped, non-pub flags
 * filtered) — the formal anti-cheat audit is task 5.4; don't treat this as
 * cleared until then.
 *
 * G.damage, G.demand and G.judgement are deliberately PUBLIC: all three are
 * face up at a real table (a 杀 landing, a player being asked for a 闪, a
 * flipped judgement card), and 5.4 should confirm exactly that and nothing
 * more. */
/** What a client may know about the general-selection window (task 5.2):
 * their own candidates, who is still choosing — and the Lord's pick, which is
 * public the moment it's made (they pick first, in the open). Everyone else's
 * pick stays hidden until selection ends and the generals go on the table, so
 * nobody can tailor their own choice to a pick that hasn't been revealed. */
function selectionView(G: GState, playerID: PlayerId | null) {
  const selection = G.selection;
  if (!selection) return null;
  const { lord, awaiting } = selection;
  return {
    lord,
    awaiting,
    candidates: playerID && selection.candidates[playerID] ? selection.candidates[playerID] : [],
    /** Locked in already — the fact, not the choice. */
    lockedIn: Object.keys(selection.picked),
    lordGeneralId: selection.picked[lord] ?? null,
    myPick: playerID ? (selection.picked[playerID] ?? null) : null,
  };
}

function playerView({ G, playerID }: { G: GState; playerID: PlayerId | null }) {
  const { drawPile, stack: _stack, selection: _selection, ...publicG } = G;

  const players: Record<string, unknown> = {};
  for (const [id, p] of Object.entries(G.players)) {
    if (id === playerID) {
      players[id] = p;
      continue;
    }
    const { hand, role, flags, ...restOfPlayer } = p;
    players[id] = {
      ...restOfPlayer,
      flags: publicFlags(flags),
      handCount: hand.length,
      ...(p.roleRevealed ? { role } : {}),
    };
  }

  const pending = !G.pending
    ? null
    : G.pending.playerId === playerID
      ? G.pending
      : { waitingOn: G.pending.playerId, kind: G.pending.kind };

  return {
    ...publicG,
    drawPileCount: drawPile.length,
    players,
    pending,
    selection: selectionView(G, playerID),
  };
}

/**
 * Generic, data-driven target validation against a CardEffect's TargetSpec
 * (server/src/content/effectTypes.ts). Per-card resolve() functions never
 * re-check targeting — this is the one place that interprets the spec, so
 * a future client-side target picker can read the same TargetSpec and stay
 * in sync without duplicating rules.
 *
 * Task 4.1b folded three skill queries in here (skill-trigger-design §4). They
 * are the reason the query face exists at all: 空城 ("you may not be targeted
 * while your hand is empty") and 奇才 ("you ignore distance for tricks") have no
 * event to hang on, and without a fold each becomes a rule-shaped `if` in this
 * function with a general's name in it.
 */
function validateTargets(
  G: GState,
  self: PlayerId,
  spec: TargetSpec,
  targets: readonly PlayerId[],
  effectKey: string,
): boolean {
  if (!Array.isArray(targets)) return false;
  if (new Set(targets).size !== targets.length) return false; // no duplicates

  const otherCount = Object.keys(G.players).length - 1;
  const specMax =
    spec.max === 'all_others' ? otherCount : spec.max === 'all' ? otherCount + 1 : spec.max;
  const max = targetLimit(G, self, effectKey, specMax); // 方天画戟 (3.6)
  if (targets.length < spec.min || targets.length > max) return false;

  const ignoreRange = ignoresDistance(G, self, effectKey); // 奇才

  for (const target of targets) {
    const player = G.players[target];
    if (!player || !player.alive) return false;
    if (target === self) {
      if (spec.self === 'forbidden') return false;
    } else if (spec.self === 'only') {
      return false;
    }
    // 空城 / 谦逊 — AND-folded, so one refusal is final and no permission can
    // override it.
    if (target !== self && !targetable(G, target, self, effectKey)) return false;
    if (!ignoreRange) {
      if (spec.inRange === 'attack' && !inAttackRange(G, self, target)) return false;
      if (spec.inRange === 'distance_1' && distance(G, self, target) > 1) return false;
    }
    if (spec.predicate && !spec.predicate(G, self, target)) return false;
  }
  return true;
}

/** 克己's counter is NOT `strikesPlayed` (skill-trigger-design §2.2 / F8): the
 * rule is "若你未于出牌阶段**使用或打出**过杀" — a 杀 played *in response* (to a
 * 决斗, or via 激将) counts too, and one supplied through a demand never goes
 * near `playCard`, which is the only thing that increments `strikesPlayed`.
 * Two counters, two different rules, both correct. */
function noteStrikeUsedInAction(G: GState, effectKey: string): void {
  if (effectKey === 'strike' && G.turnPhase === 'action') {
    G.turnFlags.strikeUsedInAction = true;
  }
}

export const ThreeKingdomsGame: Game<GState, Record<string, unknown>, ThreeKingdomsSetupData> = {
  // Shared constant, not an inline string: the client connects by this
  // exact name (@3k/shared's THREE_KINGDOMS_GAME_NAME) and a drift between
  // the two shows up only as a silent "match not found" (task 5.1).
  name: THREE_KINGDOMS_GAME_NAME,
  minPlayers: 4,
  maxPlayers: 8,

  setup: ({ ctx, random }, setupData) => {
    const playerIds: PlayerId[] =
      ctx.playOrder.length > 0
        ? ctx.playOrder
        : Array.from({ length: ctx.numPlayers }, (_, i) => String(i));

    const rng = makeRng(random as BgioRandomLike);

    // Selection (task 5.2): the match exists but hasn't begun — no hands, no
    // hit points, an empty stack. pump() would have nothing to do, and
    // deliberately isn't called: the game starts inside the chooseGeneral move
    // once the last player has picked.
    if (setupData?.selectGenerals) {
      return initSelection({ playerIds }, rng);
    }

    const generalIds = setupData?.generalIds ?? defaultGeneralIds(playerIds);
    const G = initGame({ playerIds, generalIds }, rng);
    pump(G, rng);
    return G;
  },

  turn: {
    // The Lord takes the first turn (plan §2), and the Lord is whoever the
    // role deal made them — not seat 0, which is just whoever took that seat
    // in the lobby. The engine already knows (G.activeSeat); this tells
    // boardgame.io, so ctx.currentPlayer is right from turn 1 rather than
    // being reconciled by the first syncBgio(). Turn *advancement* stays the
    // engine's (phases.ts → syncBgio's endTurn), which is why `next` reads the
    // same field rather than doing any arithmetic of its own.
    order: {
      first: ({ G }) => G.activeSeat,
      next: ({ G }) => G.activeSeat,
    },
    // Whichever player G.pending names when a bgio turn begins is put in
    // that stage — belt-and-braces alongside the per-move syncBgio() call
    // below, which is what actually keeps things in sync mid-turn.
    onBegin: ({ G, events }) => {
      const active = activePlayersFor(G);
      if (active) {
        events.setActivePlayers({ value: active });
      }
    },
    stages: {
      act: {
        moves: {
          pass: ({ G, ctx, random, events, playerID }) => {
            if (!G.pending || G.pending.kind !== 'act' || G.pending.playerId !== playerID) {
              return INVALID_MOVE;
            }
            G.pending = null;
            // The phase.end fan-out, then the next phase — the pair every phase
            // ends with (engine/phases.ts's endOfPhaseFrames). 克己 skips the
            // discard phase from inside that fan-out, and it works precisely
            // because the {t:'phase'} frame this pushes is re-checked against
            // G.skipPhases when it POPS, not now.
            pushFrames(G, endOfPhaseFrames(G, G.turnPhase, playerID));
            const rng = makeRng(random as BgioRandomLike);
            pump(G, rng);
            syncBgio(G, ctx, events);
            return undefined;
          },

          // Generic — no card-specific logic lives here. Validates hand
          // possession, rule eligibility (canPlay), and targets (TargetSpec,
          // incl. range via distance.ts), then hands off to the effect
          // registry via a {t:'play'} frame. Mechanical bookkeeping (moving
          // the played card to the discard pile, counting 杀 against the
          // strike limit) happens here because it's true of every card of
          // that shape, not particular to one effect's resolve().
          //
          // `asEffectKey` is 视为 (skill-trigger-design §4.1): 关羽 plays a ♥K
          // AS a 杀 (武圣). The claim is validated by the queries.cardsAs fold —
          // one line — and the {t:'play'} frame already carries `effectKey`
          // separately from `cards`, so nothing else changes: the physical ♥K
          // hits the discard pile as a ♥K, and 铁骑/雌雄双股剑 correctly still
          // see a heart.
          //
          // `cardIds` is an ARRAY because 丈八蛇矛 (3.6) turns TWO hand cards
          // into one 杀. A bare id is accepted as sugar for a one-card play.
          playCard: (
            { G, ctx, random, events, playerID },
            cardIds: CardId | CardId[],
            targets: PlayerId[] = [],
            asEffectKey?: string,
          ) => {
            if (!G.pending || G.pending.kind !== 'act' || G.pending.playerId !== playerID) {
              return INVALID_MOVE;
            }
            const ids = Array.isArray(cardIds) ? cardIds : [cardIds];
            if (ids.length === 0) return INVALID_MOVE;
            if (new Set(ids).size !== ids.length) return INVALID_MOVE;

            const hand = G.players[playerID]?.hand ?? [];
            if (!ids.every((id) => hand.includes(id))) return INVALID_MOVE;

            let cards: CardDef[];
            try {
              cards = ids.map((id) => getCard(id));
            } catch {
              return INVALID_MOVE;
            }

            let effectKey: string;
            if (asEffectKey === undefined) {
              // A plain play: one card, played as itself.
              if (ids.length !== 1) return INVALID_MOVE;
              effectKey = cards[0].effectKey;
            } else {
              // 视为. The server decides whether the claim is allowed.
              if (!cardsAs(G, playerID, cards, asEffectKey)) return INVALID_MOVE;
              effectKey = asEffectKey;
            }

            const effect = effectRegistry[effectKey];
            if (!effect) return INVALID_MOVE;
            if (!effect.canPlay(G, playerID)) return INVALID_MOVE;
            if (!validateTargets(G, playerID, effect.targeting, targets, effectKey)) {
              return INVALID_MOVE;
            }

            discardFromHand(G, playerID, ids);
            if (effectKey === 'strike') {
              G.turnFlags.strikesPlayed += 1;
            }
            noteStrikeUsedInAction(G, effectKey);

            G.pending = null;
            // Narrative order: the cards leave the hand (连营/枭姬 hear it), the
            // play resolves (and may itself block on a 闪 along the way); once
            // it's fully drained, a fresh 'act' request reappears so the player
            // can keep playing cards or choose to pass — nothing else would
            // re-open the action phase once this pending is cleared. `pass` is
            // what actually ends the phase.
            pushFrames(G, [
              cardLostFrame(playerID, ids, 'hand'),
              { t: 'play', source: playerID, cards: ids, targets, effectKey },
              { t: 'request', req: { kind: 'act', playerId: playerID } },
            ]);
            const rng = makeRng(random as BgioRandomLike);
            pump(G, rng);
            syncBgio(G, ctx, events);
            return undefined;
          },

          // An ACTIVE skill (制衡, 仁德, 观星, 结姻, 反间, 离间, 青囊…) — the third
          // face of a Skill (skill-trigger-design §1), and the one the player
          // *starts*. It IS a CardEffect, so it resolves through exactly the
          // machinery a card does; the only things this move owns are the ones
          // that are true of every active skill: do you have it, is its limit
          // spent, are these your cards, are those legal targets.
          //
          // Nothing registers an active until 4.4 — this is a wired, empty
          // door, and that is the point of 4.1b.
          useSkill: (
            { G, ctx, random, events, playerID },
            skillId: string,
            cardIds: CardId[] = [],
            targets: PlayerId[] = [],
          ) => {
            if (!G.pending || G.pending.kind !== 'act' || G.pending.playerId !== playerID) {
              return INVALID_MOVE;
            }
            // Do they actually have it? Read live, through the same source the
            // trigger fan-out uses — which is also where 主公技 are filtered out
            // for a player who is not the lord.
            if (!skillsOfPlayer(G, playerID).some((s) => s.id === skillId)) return INVALID_MOVE;
            const skill = skillRegistry[skillId];
            const active: CardEffect | undefined = skill?.active;
            if (!active) return INVALID_MOVE;

            // 每回合限一次 — engine-enforced, never re-implemented by the skill
            // (§3.5).
            const limit = activeLimitKey(skillId, skill.activeLimit);
            if (limit !== null && G.turnFlags[limit] === true) return INVALID_MOVE;

            if (!Array.isArray(cardIds) || new Set(cardIds).size !== cardIds.length) {
              return INVALID_MOVE;
            }
            const hand = G.players[playerID]?.hand ?? [];
            if (!cardIds.every((id) => hand.includes(id))) return INVALID_MOVE;
            if (!active.canPlay(G, playerID)) return INVALID_MOVE;
            if (!validateTargets(G, playerID, active.targeting, targets, activeEffectKey(skillId))) {
              return INVALID_MOVE;
            }

            if (limit !== null) G.turnFlags[limit] = true;
            G.pending = null;
            // The cards are NOT discarded here: an active skill decides what
            // happens to them (仁德 gives them away, 制衡 discards and redraws,
            // 苦肉 costs none at all), and it does that with {t:'moveCards'} —
            // which is also what emits card.lost from the one place that moves
            // cards.
            pushFrames(G, [
              {
                t: 'effect',
                effectKey: activeEffectKey(skillId),
                ctx: { source: playerID, cards: cardIds, targets },
              },
              { t: 'request', req: { kind: 'act', playerId: playerID } },
            ]);
            const rng = makeRng(random as BgioRandomLike);
            pump(G, rng);
            syncBgio(G, ctx, events);
            return undefined;
          },
        },
      },
      // General selection (task 5.2). Unlike every other stage here, this one
      // can hold several players at once — after the Lord reveals, everyone
      // else picks simultaneously — so it's driven by G.selection.awaiting
      // rather than G.pending. The last pick to land is what actually starts
      // the game: completeSelection() deals the opening hands and puts turn 1
      // on the stack (with the Lord, not seat 0), and the pump() below runs it
      // into the Lord's first action phase.
      [STAGE_CHOOSE_GENERAL]: {
        moves: {
          chooseGeneral: ({ G, ctx, random, events, playerID }, generalId: string) => {
            if (!G.selection || !playerID) return INVALID_MOVE;
            // applyPick does every check (are you being asked, is that one of
            // *your* candidates, have you already picked) and applies nothing
            // if any of them fail — an illegal move must not half-apply.
            if (!applyPick(G, playerID, generalId)) return INVALID_MOVE;

            const rng = makeRng(random as BgioRandomLike);
            if (isSelectionComplete(G.selection)) {
              completeSelection(G, rng);
              pump(G, rng);
            }
            syncBgio(G, ctx, events);
            return undefined;
          },
        },
      },
      // THE card-response stage — docs/skill-trigger-design.md §5. "Supply
      // `count` cards of kind K, or don't." 杀→闪, 决斗→杀, 濒死→桃, trick→无懈可击
      // and 南蛮/万箭 all come through here, and as of 4.1b so do the first two:
      // `respondDodge` and `respondPeach` (stages AND moves) were DELETED, not
      // rewritten. That deletion is the whole return on having built 3.2's
      // nullification chain as a demand from day one.
      //
      // The answer is written into G.demand.supplied, NOT into the resume frame
      // directly — {t:'demandClose'} does that, once the demand is over. The
      // difference matters for exactly one reason, and it is the reason the
      // field exists: a PROXY supplier (护驾: a Wei player answers for the lord;
      // 激将: a Shu player answers for 刘备) is answering someone else's demand
      // from inside frames of its own, and it may not reach down the stack to
      // patch the original demander's resume frame (§2.1).
      //
      // A PARTIAL ANSWER IS NO ANSWER (§5.4): supply exactly `count` cards or
      // supply none. `null`/`undefined`/[] all mean "declined".
      demandCard: {
        moves: {
          supplyCards: ({ G, ctx, random, events, playerID }, cardIds?: CardId[] | null) => {
            if (!G.pending || G.pending.kind !== 'demandCard' || G.pending.playerId !== playerID) {
              return INVALID_MOVE;
            }
            const demand = G.demand;
            if (!demand) return INVALID_MOVE;
            const demandKind = G.pending.demandKind as string;
            const count = G.pending.count as number;

            if (cardIds != null && cardIds.length > 0) {
              if (cardIds.length !== count) return INVALID_MOVE;
              if (new Set(cardIds).size !== cardIds.length) return INVALID_MOVE;
              const hand = G.players[playerID]?.hand ?? [];
              if (!cardIds.every((id) => hand.includes(id))) return INVALID_MOVE;

              let cards: CardDef[];
              try {
                cards = cardIds.map((id) => getCard(id));
              } catch {
                return INVALID_MOVE;
              }
              // The queries.cardsAs fold, not an `effectKey ===` check: this one
              // line is what lets 武圣 answer a 决斗's 杀 demand with a red card,
              // 龙胆 answer a 闪 demand with a 杀, and 急救 answer a 桃 demand
              // with any red card. Each supplied card must satisfy it on its
              // own — a demand for two 闪 (无双) is two separate 闪, not one
              // two-card combination.
              if (!cards.every((card) => cardsAs(G, playerID, [card], demandKind))) {
                return INVALID_MOVE;
              }

              discardFromHand(G, playerID, cardIds);
              noteStrikeUsedInAction(G, demandKind); // 克己 (§2.2): 打出 counts too
              demand.supplied = cardIds;
              G.pending = null;
              G.stack.push(cardLostFrame(playerID, cardIds, 'hand'));
            } else {
              // Declined. `supplied` stays null — which is NOT the same as the
              // empty array a deemed card (八卦阵) writes. Do not collapse them.
              G.pending = null;
            }

            const rng = makeRng(random as BgioRandomLike);
            pump(G, rng);
            syncBgio(G, ctx, events);
            return undefined;
          },
        },
      },
      // An OPTIONAL trigger's yes/no (skill-trigger-design §3.4) — one request,
      // no more. A "yes" re-pushes the very same {t:'triggerStep'} with
      // `confirmed`, which is also when its once-per-turn is spent; a "no"
      // pushes nothing at all, so declining costs the player nothing.
      //
      // 锁定技 (optional: false) never reach this stage. Marking a trigger
      // optional that should be mandatory turns the game into eleven prompts a
      // turn — §8 fixes `optional` for all 40 skills, and it is not the
      // implementer's judgment call.
      confirmSkill: {
        moves: {
          respondSkill: ({ G, ctx, random, events, playerID }, use: boolean) => {
            if (!G.pending || G.pending.kind !== 'confirmSkill' || G.pending.playerId !== playerID) {
              return INVALID_MOVE;
            }
            const triggerId = G.pending.triggerId as string;
            const ev = G.pending.ev as TriggerEvent;
            G.pending = null;
            if (use) {
              const step: Frame = { t: 'triggerStep', ev, owner: playerID, triggerId, confirmed: true };
              G.stack.push(step);
            }
            const rng = makeRng(random as BgioRandomLike);
            pump(G, rng);
            syncBgio(G, ctx, events);
            return undefined;
          },
        },
      },
      // §3.1 step 3: one player, two eligible triggers on one event, same
      // priority band — THE OWNER CHOOSES THE ORDER. Cold path by construction
      // (no Standard general has two triggers on one event; it becomes
      // reachable when a skill and an equipment trigger collide — 奸雄 with a
      // future on-damage weapon), and it exists because the alternative is a
      // silent tiebreak by registration order, which is a rules bug that first
      // shows up in an expansion when nobody remembers this code.
      //
      // The answer re-pushes the whole fan-out with the chosen order merged in;
      // eligibility is re-derived there, exactly as it would have been.
      orderTriggers: {
        moves: {
          orderTriggers: ({ G, ctx, random, events, playerID }, triggerIds: string[]) => {
            if (!G.pending || G.pending.kind !== 'orderTriggers' || G.pending.playerId !== playerID) {
              return INVALID_MOVE;
            }
            const offered = G.pending.triggerIds as string[];
            const ev = G.pending.ev as TriggerEvent;
            const order = (G.pending.order ?? {}) as Record<PlayerId, string[]>;
            if (!Array.isArray(triggerIds)) return INVALID_MOVE;
            if (triggerIds.length !== offered.length) return INVALID_MOVE;
            if (new Set(triggerIds).size !== triggerIds.length) return INVALID_MOVE;
            if (!triggerIds.every((id) => offered.includes(id))) return INVALID_MOVE;

            G.pending = null;
            G.stack.push({
              t: 'trigger',
              ev,
              order: { ...order, [playerID]: triggerIds },
            });
            const rng = makeRng(random as BgioRandomLike);
            pump(G, rng);
            syncBgio(G, ctx, events);
            return undefined;
          },
        },
      },
      // Pointing at one of someone else's cards — 过河拆桥 / 顺手牵羊 (task 3.3,
      // judgement-nullification-design §5). The request carries opaque hand
      // SLOTS, never card ids: a card id leaks suit and rank, and the attacker
      // is not entitled to the victim's hand. This move maps the slot back to a
      // real card against LIVE state (engine/cardChoice.ts's resolveSlot) — the
      // engine was blocked on G.pending the whole time, so nothing can have
      // moved underneath it.
      chooseCard: {
        moves: {
          chooseCard: ({ G, ctx, random, events, playerID }, slot: CardSlot) => {
            if (!G.pending || G.pending.kind !== 'chooseCard' || G.pending.playerId !== playerID) {
              return INVALID_MOVE;
            }
            const target = G.pending.target as PlayerId;
            const resolved = resolveSlot(G, target, slot);
            if (!resolved) return INVALID_MOVE; // out-of-bounds index, unworn equipment…

            applyToResumeFrame(G, { chosen: resolved.cardId, chosenZone: resolved.zone });
            G.pending = null;
            const rng = makeRng(random as BgioRandomLike);
            pump(G, rng);
            syncBgio(G, ctx, events);
            return undefined;
          },
        },
      },
      discard: {
        moves: {
          discard: ({ G, ctx, random, events, playerID }, cardIds: string[]) => {
            if (!G.pending || G.pending.kind !== 'discard' || G.pending.playerId !== playerID) {
              return INVALID_MOVE;
            }
            const required = G.pending.count as number;
            if (!Array.isArray(cardIds) || cardIds.length !== required) {
              return INVALID_MOVE;
            }
            try {
              discardFromHand(G, playerID, cardIds);
            } catch {
              return INVALID_MOVE;
            }
            G.pending = null;
            pushFrames(G, [
              cardLostFrame(playerID, cardIds, 'hand'),
              ...endOfPhaseFrames(G, G.turnPhase, playerID),
            ]);
            const rng = makeRng(random as BgioRandomLike);
            pump(G, rng);
            syncBgio(G, ctx, events);
            return undefined;
          },
        },
      },
    },
  },

  // A death is the only thing that can end a Standard game (task 5.3):
  // engine/victory.ts sets G.gameOver, pump() halts on it, and this is what
  // tells boardgame.io — which then refuses every subsequent move.
  endIf: ({ G }) => G.gameOver,

  playerView,
};
