// 反馈 (4.3 / Batch B) — after damage, take one card from the source. Task 4.5.
//
// Covers the trigger AND the `fankui_take` continuation it resumes into. The
// source's hand is hidden, so this must go through 3.3's slot protocol
// (engine/cardChoice.ts) — a test that ever sees a raw hand card ID in the
// REQUEST is a leak, not a passing test.

import { describe, it, expect } from 'vitest';
import { makeGState, makePlayer } from '../../engine/fixtures.js';
import { fankui, fankuiTake } from '../../../src/content/skills/fankui.js';

const trigger = fankui.triggers![0];

const dmg = (over: Record<string, unknown> = {}) =>
  ({ event: 'damage.after', source: '1', target: '0', amount: 1, kind: 'normal', seq: 1, ...over }) as never;

function state(source: Partial<ReturnType<typeof makePlayer>> = {}) {
  return makeGState({
    players: { '0': makePlayer('0'), '1': makePlayer('1', source) },
  });
}

describe('fankui — damage.after, only when the source has something to take', () => {
  it('fires when the source holds a hand card', () => {
    expect(trigger.when(dmg(), state({ hand: ['strike_2c'] }), '0')).toBe(true);
  });

  it('fires when the source has only equipment or only a judgement card', () => {
    const equipped = state({
      equipment: { weapon: 'zhuge_crossbow_1c', armour: null, plusHorse: null, minusHorse: null },
    } as never);
    expect(trigger.when(dmg(), equipped, '0')).toBe(true);

    const judged = state({ judgementZone: ['indulgence_6h'] });
    expect(trigger.when(dmg(), judged, '0')).toBe(true);
  });

  it('does not prompt when the source has nothing at all in any zone (§3.4)', () => {
    expect(trigger.when(dmg(), state(), '0')).toBe(false);
  });

  it('does not fire for damage to someone else, nor for source-less damage', () => {
    const G = state({ hand: ['strike_2c'] });
    expect(trigger.when(dmg({ target: '1' }), G, '0')).toBe(false);
    expect(trigger.when(dmg({ source: null }), G, '0')).toBe(false);
  });

  it('asks by SLOT, never by hand-card id, and resumes into fankui_take', () => {
    const G = state({ hand: ['strike_2c', 'peach_3h'] });
    const frames = trigger.effect(dmg(), G, '0');
    expect(frames).toEqual([
      {
        t: 'request',
        req: {
          kind: 'chooseCard',
          playerId: '0',
          target: '1',
          reasonKey: 'choose.fankui',
          choices: [
            { z: 'hand', index: 0 },
            { z: 'hand', index: 1 },
          ],
        },
      },
      { t: 'resume', effectKey: 'fankui_take', ctx: { owner: '0', source: '1' } },
    ]);
    // The whole point of the slot protocol: no id of a hidden hand card leaves.
    expect(JSON.stringify(frames)).not.toContain('strike_2c');
  });
});

describe('fankui_take — the continuation', () => {
  it('moves the chosen card to the owner\'s hand and logs the theft WITHOUT naming a hand card (5.4)', () => {
    const G = state({ hand: ['strike_2c'] });
    expect(
      fankuiTake.resolve(G, {
        owner: '0',
        source: '1',
        chosen: 'strike_2c',
        chosenZone: { z: 'hand', player: '1' },
      } as never),
    ).toEqual([
      {
        t: 'moveCards',
        cards: ['strike_2c'],
        from: { z: 'hand', player: '1' },
        to: { z: 'hand', player: '0' },
        by: '0',
      },
      // G.log is public (playerView sends it whole) — naming the card here would
      // tell the whole table what came out of a hidden hand. See
      // docs/anti-cheat-audit.md.
      { t: 'log', key: 'log.card_taken_hidden', params: { player: '0', target: '1' } },
    ]);
  });

  it('DOES name the card when it came from a face-up zone — equipment was never secret', () => {
    const G = state({
      equipment: { weapon: 'zhuge_crossbow_1c', armour: null, plusHorse: null, minusHorse: null },
    } as never);
    const frames = fankuiTake.resolve(G, {
      owner: '0',
      source: '1',
      chosen: 'zhuge_crossbow_1c',
      chosenZone: { z: 'equip', player: '1' },
    } as never);
    expect(frames[1]).toEqual({
      t: 'log',
      key: 'log.card_taken',
      params: { player: '0', target: '1', card: 'zhuge_crossbow_1c' },
    });
  });

  it('is a no-op when nothing was chosen, and is never playable as a card', () => {
    const G = state({ hand: ['strike_2c'] });
    expect(fankuiTake.resolve(G, { owner: '0', source: '1' } as never)).toEqual([]);
    expect(fankuiTake.canPlay(G, '0')).toBe(false);
  });
});
