// 五谷丰登 Harvest — 3.3's deferred card, now 3.4's (CONTINUE.md / docs/
// handoff/3.3-simple-tricks.md §4). The one `nullify: 'custom'` card
// (judgement-nullification-design §2.2): reveal N cards off the draw pile
// (N = living player count), then each living player, in turn order starting
// with whoever played the card, picks ONE into their own hand; anything left
// over is discarded.
//
// THE REVEAL-PRIMITIVE DESIGN CALL (this task's to make, per CONTINUE.md and
// build-breakdown.md's 3.3b row): a `{t:'reveal', count}` primitive,
// resolved in pump.ts where the `rng` lives — NOT a `count`-carrying variant
// of `moveCards`. Reasoning, in full, in frames.ts's comment on `'reveal'`;
// short version: `moveCards` always names the exact ids it's moving (that's
// what lets an effect return it without touching G), and a reveal can't know
// those ids in advance without the rng CardEffect.resolve() isn't allowed to
// touch (engine-design §3). Overloading `moveCards` to sometimes resolve its
// own `cards` from a `count` would have split its contract in two depending
// on the source zone — a fourth primitive is cleaner than a schizophrenic
// third one.
//
// SELF-WRAPPING NULLIFICATION (the other half of `'custom'`): pump.ts's
// 'play' case does NOT wrap a `'custom'` card in any window at all — this
// effect wraps ONE window around its own re-entrant continuation on the
// FIRST call (guarding the reveal itself; a single 无懈可击 cancels the whole
// card, nobody sees anything). Once that window survives (or there was
// nothing to nullify), the re-entrant call carries `revealed: true` and does
// the actual reveal + picks; nothing past that point is nullifiable — matches
// design §2's "一张锦囊牌对一名角色产生的效果" not applying once the shared
// reveal has already happened for everyone.
//
// ⚠️ Known client gap, same shape as 3.3's own chooseCard gap (docs/handoff/
// 3.3-simple-tricks.md §5): `CardSlot`'s new `{z:'revealed'}` variant
// (engine/cardChoice.ts) has no renderer anywhere under client/src/ yet. The
// server-side flow is complete and correct; a table that plays 五谷丰登 today
// will stall on whichever player is asked to pick, exactly like 3.3's
// chooseCard did until 6.4b closed it. Flagged for whichever session next
// opens PromptPanel/ChoicePanel.

import type { CardEffect } from '../effectTypes.js';
import type { Frame } from '../../engine/frames.js';
import type { CardId, GState, PlayerId } from '../../engine/state.js';
import type { CardSlot } from '../../engine/cardChoice.js';
import { nullifyWindowFrame } from './nullifyWindow.js';

interface HarvestCtx {
  source: PlayerId;
  targets: PlayerId[];
  cards: CardId[];
  /** Set once the nullify window around the reveal has resolved (odd ⇒ this
   * whole branch never runs at all — see the header). */
  revealed?: boolean;
  /** Turn order for picks, computed once right after the reveal. */
  order?: PlayerId[];
  pickIndex?: number;
  /** Set while a `chooseCard` request for the current picker is in flight. */
  asked?: boolean;
  chosen?: CardId;
  chosenZone?: { z: 'revealed' };
}

/** Living players starting at `source`, going clockwise — the pick order. */
function pickOrderFrom(G: GState, source: PlayerId): PlayerId[] {
  const seatOfSource = G.players[source]?.seat ?? 0;
  const n = G.seats.length;
  const order: PlayerId[] = [];
  for (let step = 0; step < n; step++) {
    const id = G.seats[(seatOfSource + step) % n];
    if (G.players[id]?.alive) order.push(id);
  }
  return order;
}

export const harvest: CardEffect = {
  key: 'harvest',

  // Affects every living player automatically (turn order from the source) —
  // nobody is chosen at play time, same shape as 无中生有/闪电.
  targeting: { min: 0, max: 0, self: 'only' },

  nullify: 'custom',

  canPlay: () => true,

  resolve: (G: GState, rawCtx) => {
    const ctx = rawCtx as unknown as HarvestCtx;
    const source = ctx.source;

    if (!ctx.revealed) {
      // Step 1: ONE window for the whole card, guarding the reveal itself.
      return [
        { t: 'log', key: 'log.plays', params: { player: source, card: ctx.cards[0] } },
        nullifyWindowFrame(
          {
            t: 'effect',
            effectKey: 'harvest',
            ctx: { ...ctx, revealed: true } as unknown as Record<string, unknown>,
          },
          'nullify.harvest',
        ),
      ];
    }

    if (!ctx.order) {
      // Step 2: not nullified — reveal N cards (N = living players) and set
      // up the pick order. {t:'reveal'} is generic plumbing (pump.ts); this
      // effect never touches the rng or G.drawPile directly.
      const livingCount = G.seats.filter((id) => G.players[id]?.alive).length;
      const order = pickOrderFrom(G, source);
      return [
        { t: 'reveal', count: livingCount },
        { t: 'log', key: 'log.reveals', params: { player: source, n: livingCount } },
        {
          t: 'resume',
          effectKey: 'harvest',
          ctx: { ...ctx, order, pickIndex: 0 } as unknown as Record<string, unknown>,
        },
      ];
    }

    const order = ctx.order;
    const idx = ctx.pickIndex ?? 0;

    if (idx >= order.length || G.revealed.length === 0) {
      // Done — sweep any leftovers (a short deck mid-reveal, vanishingly rare)
      // to the discard pile so they don't sit in public limbo forever.
      if (G.revealed.length > 0) {
        return [{ t: 'moveCards', cards: [...G.revealed], from: { z: 'revealed' }, to: { z: 'discard' } }];
      }
      return [];
    }

    const picker = order[idx];

    if (!G.players[picker]?.alive) {
      // Died between reveal and their turn to pick (another effect in the
      // 无懈可击 argument, in principle) — skip them, don't ask a corpse.
      return [
        {
          t: 'effect',
          effectKey: 'harvest',
          ctx: { ...ctx, pickIndex: idx + 1 } as unknown as Record<string, unknown>,
        },
      ];
    }

    if (!ctx.asked) {
      const choices: CardSlot[] = G.revealed.map((cardId) => ({ z: 'revealed', cardId }));
      return [
        {
          t: 'request',
          req: {
            kind: 'chooseCard',
            playerId: picker,
            target: picker, // unused for 'revealed' slots (cardChoice.ts) — required field
            reasonKey: 'choose.harvest',
            choices,
          },
        },
        {
          t: 'resume',
          effectKey: 'harvest',
          ctx: { ...ctx, asked: true } as unknown as Record<string, unknown>,
        },
      ];
    }

    // Came back with the picker's answer.
    const chosen = ctx.chosen;
    const from = ctx.chosenZone;
    const frames: Frame[] = [];
    if (chosen && from) {
      frames.push({ t: 'moveCards', cards: [chosen], from, to: { z: 'hand', player: picker }, by: picker });
      frames.push({ t: 'log', key: 'log.picks', params: { player: picker, card: chosen } });
    }
    frames.push({
      t: 'effect',
      effectKey: 'harvest',
      ctx: { ...ctx, asked: false, pickIndex: idx + 1 } as unknown as Record<string, unknown>,
    });
    return frames;
  },
};
