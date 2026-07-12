// 突袭 (Zhang Liao) — in your draw phase, you may give up drawing and instead
// take one card each from up to two other players (their choice of zone —
// hand, equipment or judgement zone — is yours to pick, same as 顺手牵羊/反馈).
// Standard text: "摸牌阶段，你可以放弃摸牌，改为获得至多两名其他角色各一张牌。"
//
// A REPLACEMENT trigger (skill-trigger-design §2.2): pushes {t:'skipPhase',
// phase:'draw'} before the draw phase's own body pops, which is the whole
// reason a phase had to split into phase.start + phaseBody in the first
// place. The picking loop asks ONE player at a time via the new
// `choosePlayer` request (task 4.3, bgio/game.ts) — "or stop" is how "up to
// two" is expressed, mirroring frostBlade.ts's "ask again vs stop" shape one
// level up (pick a player, THEN pick one of their cards, repeat).

import type { CardEffect } from '../effectTypes.js';
import type { Skill } from '../skillTypes.js';
import type { SkillTrigger } from '../triggerTypes.js';
import type { Frame, Zone } from '../../engine/frames.js';
import type { CardId, GState, PlayerId } from '../../engine/state.js';
import { cardChoicesFor, hasChoosableCards } from '../../engine/cardChoice.js';

interface TuxiCtx {
  owner: PlayerId;
  remaining: number;
  /** Set once a `choosePlayer` answer is waiting to be read. */
  awaitingCard?: boolean;
  pickFrom?: PlayerId;
  chosenPlayer?: PlayerId | null;
  chosen?: CardId;
  chosenZone?: Zone;
}

/** Ask for the next player to take from, or stop if `remaining` is spent or
 * nobody eligible is left (excludes the owner; requires at least one
 * choosable card — asking to steal from an empty-handed, unequipped player is
 * never useful, the same guard 过河拆桥/顺手牵羊's targeting predicate uses). */
function tuxiAskPlayerFrames(G: GState, owner: PlayerId, remaining: number): Frame[] {
  if (remaining <= 0) return [];
  const candidates = G.seats.filter(
    (id) => id !== owner && G.players[id]?.alive && hasChoosableCards(G, id),
  );
  if (candidates.length === 0) return [];
  return [
    { t: 'request', req: { kind: 'choosePlayer', playerId: owner, reasonKey: 'choose.tuxi', candidates } },
    { t: 'resume', effectKey: 'tuxi_steal', ctx: { owner, remaining } },
  ];
}

const tuxiSteal: CardEffect = {
  key: 'tuxi_steal',
  targeting: { min: 0, max: 0, self: 'only' },
  canPlay: () => false,
  resolve: (G, rawCtx) => {
    const ctx = rawCtx as unknown as TuxiCtx;
    const owner = ctx.owner;

    if (!ctx.awaitingCard) {
      // Came back from `choosePlayer` — chosenPlayer is undefined on the very
      // first entry (called directly from the trigger's effect(), no answer
      // to read yet) and null/PlayerId once a choosePlayer answer has landed.
      if (ctx.chosenPlayer === undefined) {
        return tuxiAskPlayerFrames(G, owner, ctx.remaining);
      }
      const picked = ctx.chosenPlayer;
      if (!picked) return []; // declined — "up to two" allows stopping early
      if (!G.players[picked]?.alive) {
        return tuxiAskPlayerFrames(G, owner, ctx.remaining); // died since being offered — retry
      }
      const choices = cardChoicesFor(G, picked);
      if (choices.length === 0) {
        return tuxiAskPlayerFrames(G, owner, ctx.remaining); // emptied since being offered — retry
      }
      return [
        {
          t: 'request',
          req: { kind: 'chooseCard', playerId: owner, target: picked, reasonKey: 'choose.tuxi_take', choices },
        },
        { t: 'resume', effectKey: 'tuxi_steal', ctx: { owner, remaining: ctx.remaining, awaitingCard: true, pickFrom: picked } },
      ];
    }

    // Came back from `chooseCard` for the player we just picked.
    const frames: Frame[] = [];
    if (ctx.chosen && ctx.chosenZone) {
      frames.push({ t: 'moveCards', cards: [ctx.chosen], from: ctx.chosenZone, to: { z: 'hand', player: owner }, by: owner });
      // ⚠️ 5.4 (docs/anti-cheat-audit.md): G.log is PUBLIC. A card lifted out of
      // a hidden HAND must not be named in it — only 张辽 is entitled to know
      // which one he took. Equipment / judgement-zone cards were already face up.
      frames.push(
        ctx.chosenZone.z === 'hand'
          ? { t: 'log', key: 'log.card_taken_hidden', params: { player: owner, target: ctx.pickFrom } }
          : { t: 'log', key: 'log.card_taken', params: { player: owner, target: ctx.pickFrom, card: ctx.chosen } },
      );
    }
    frames.push(...tuxiAskPlayerFrames(G, owner, ctx.remaining - 1));
    return frames;
  },
};

const tuxiTrigger: SkillTrigger = {
  id: 'skill.tuxi',
  event: 'phase.start',
  optional: true,
  labelKey: 'skill.tuxi.name',
  when: (e, G, owner) => {
    if (e.event !== 'phase.start' || e.phase !== 'draw' || e.player !== owner) return false;
    return G.seats.some((id) => id !== owner && G.players[id]?.alive && hasChoosableCards(G, id));
  },
  effect: (_e, _G, owner): Frame[] => [
    { t: 'skipPhase', phase: 'draw' },
    { t: 'effect', effectKey: 'tuxi_steal', ctx: { owner, remaining: 2 } },
  ],
};

export const tuxi: Skill = {
  id: 'tuxi',
  locked: false,
  triggers: [tuxiTrigger],
};

export { tuxiSteal };
