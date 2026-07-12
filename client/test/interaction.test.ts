// Prompt / targeting / log unit tests (task 6.2). Everything the interaction
// layer decides is a pure function, so the rules of engagement are asserted here
// rather than discovered by clicking around the harness.

import { describe, expect, it } from 'vitest';
import en from '../../locales/en.json';
import zh from '../../locales/zh.json';
import { THREE_KINGDOMS_STAGE_MOVES, cards } from '@3k/shared';
import { FIXTURES } from '../src/game/fixtures';
import {
  CARD_BLOCK_I18N_KEY,
  IMPLEMENTED_EFFECT_KEYS,
  candidateTargets,
  cardBlock,
  isImplemented,
  livingOthers,
  demandSubject,
  demandReasonKey,
  promptFor,
  targetRange,
  viewerOf,
} from '../src/game/prompts';
import {
  EMPTY_SELECTION,
  canSubmit,
  chooseSlot,
  sameSlot,
  selectionKey,
  toggleCard,
  toggleTarget,
} from '../src/game/interaction';
import { LOG_KEYS, resolveLogParams } from '../src/game/log';
import { recordingActions, type RecordedIntent } from '../src/game/actions';
import type { SelfPlayerView, TableState } from '../src/game/viewTypes';

const fx = (id: string) => {
  const f = FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`no fixture ${id}`);
  return f;
};

const idOf = (effectKey: string, i = 0) => cards.filter((c) => c.effectKey === effectKey)[i].id;

const viewerIn = (state: TableState, viewerId: string): SelfPlayerView => {
  const v = viewerOf(state, viewerId);
  if (!v) throw new Error('viewer has no hand');
  return v;
};

describe('promptFor', () => {
  it('asks the acting player to play or pass', () => {
    const { state, viewerId } = fx('4p · opening');
    const prompt = promptFor(state, viewerId);
    expect(prompt?.kind).toBe('act');
    expect(prompt?.needsTargets).toBe(true);
    expect(prompt?.secondary).toBe('pass');
    expect(prompt?.allowedEffectKeys).toBeNull(); // any card may be attempted
  });

  it('asks the target of a 杀 for a 闪 — through the ONE demand prompt (4.1b)', () => {
    // 杀→闪, 濒死→桃, 决斗→杀 and trick→无懈可击 are one prompt now: the demand
    // (docs/skill-trigger-design.md §5). The two bespoke cases this replaced are
    // gone, and the next four cards arrive through this same one.
    const { state, viewerId } = fx('8p · midgame');
    const prompt = promptFor(state, viewerId);
    expect(prompt?.kind).toBe('demandCard');
    expect(prompt?.allowedEffectKeys).toEqual(['dodge']);
    expect(prompt?.cardCount).toBe(1); // 无双 would make this 2, and it just works
    expect(prompt?.needsTargets).toBe(false); // the 杀 already has a target: you
    expect(prompt?.secondary).toBe('decline');
  });

  it('gives the discard prompt no way out — the engine will not move on', () => {
    const { state, viewerId } = fx('4p · discard');
    const prompt = promptFor(state, viewerId);
    expect(prompt?.kind).toBe('discard');
    expect(prompt?.cardCount).toBe(3); // hand limit = current hp (3), holding 6
    expect(prompt?.secondary).toBeNull();
  });

  it('gives no prompt to anyone the engine is not waiting on', () => {
    const { state } = fx('8p · midgame');
    for (const other of ['0', '1', '3', '7']) {
      expect(promptFor(state, other)).toBeNull();
    }
  });

  it('gives no prompt to a spectator, or once the game is over', () => {
    expect(promptFor(fx('8p · midgame').state, null)).toBeNull();
    const over = fx('4p · game over');
    expect(promptFor(over.state, over.viewerId)).toBeNull();
  });

  it('names who a demanded 桃 is FOR — the dying player may not be the one asked', () => {
    const { state, viewerId } = fx('4p · dying window');
    const prompt = promptFor(state, viewerId);
    expect(prompt?.kind).toBe('demandCard');
    expect(prompt?.allowedEffectKeys).toEqual(['peach']);
    expect(demandSubject(state)).toBe('1'); // here: the viewer is the dying one
  });
});

describe('the demand prompt is GENERIC — the next four cards need no new case', () => {
  const demand = (extra: Record<string, unknown>) => ({
    ...fx('8p · midgame').state,
    pending: { kind: 'demandCard', playerId: '2', count: 1, reasonKey: 'demand.dodge', ...extra },
  });

  it('carries the 无双 count of two straight through to the card selector', () => {
    const prompt = promptFor(demand({ demandKind: 'dodge', count: 2 }), '2');
    expect(prompt?.cardCount).toBe(2);
  });

  it('offers a 无懈可击 demand — a kind the board has never been taught', () => {
    const prompt = promptFor(demand({ demandKind: 'nullification' }), '2');
    expect(prompt?.kind).toBe('demandCard');
    expect(prompt?.allowedEffectKeys).toEqual(['nullification']);
    expect(prompt?.titleKey).toBe('prompt.demand_nullification');
  });

  it('falls back to a generic title for a demand kind that has no copy yet', () => {
    // A new card in 3.4 or a skill in 4.4 must never render a BLANK prompt just
    // because nobody wrote its title. It renders the generic one and the
    // reasonKey underneath.
    const prompt = promptFor(demand({ demandKind: 'something_new' }), '2');
    expect(prompt?.titleKey).toBe('prompt.demand');
    expect(prompt?.secondaryKey).toBe('prompt.demand_decline');
  });

  it('surfaces the reasonKey — WHY the card is being asked for', () => {
    expect(demandReasonKey(demand({ demandKind: 'dodge' }))).toBe('demand.dodge');
    expect(demandReasonKey(fx('4p · opening').state)).toBeNull(); // not a demand
  });

  it('an optional skill asks a yes/no and wants no cards at all (§3.4)', () => {
    const state = {
      ...fx('8p · midgame').state,
      pending: { kind: 'confirmSkill', playerId: '2', triggerId: 'skill.jianxiong' },
    };
    const prompt = promptFor(state, '2');
    expect(prompt?.kind).toBe('confirmSkill');
    expect(prompt?.cardCount).toBe(0);
    expect(prompt?.needsTargets).toBe(false);
    expect(prompt?.secondary).toBe('decline');
  });
});

describe('cardBlock — which cards can answer this prompt', () => {
  it('accepts only 闪 for a dodge request', () => {
    const { state, viewerId } = fx('8p · midgame');
    const viewer = viewerIn(state, viewerId);
    const prompt = promptFor(state, viewerId)!;

    const dodge = viewer.hand.find((c) => isImplemented(c) && cardBlock(state, viewer, prompt, c) === null);
    expect(dodge).toBeDefined();
    for (const cardId of viewer.hand) {
      const block = cardBlock(state, viewer, prompt, cardId);
      const isDodge = cards.find((c) => c.id === cardId)?.effectKey === 'dodge';
      expect(block === null).toBe(isDodge);
      if (!isDodge) expect(block).toBe('wrong_card');
    }
  });

  it('greys out a 杀 once the strike limit is spent, and 桃 when unwounded', () => {
    const { state, viewerId } = fx('4p · opening');
    const viewer = viewerIn(state, viewerId);
    const prompt = promptFor(state, viewerId)!;

    // Opening hand: full hp, no strikes played yet.
    expect(cardBlock(state, viewer, prompt, idOf('strike'))).toBeNull();
    expect(cardBlock(state, viewer, prompt, idOf('peach'))).toBe('not_wounded');

    const spent: TableState = { ...state, turnFlags: { ...state.turnFlags, strikesPlayed: 1 } };
    expect(cardBlock(spent, viewer, prompt, idOf('strike'))).toBe('strike_limit');
  });

  it('greys out cards whose effect the server cannot resolve yet', () => {
    const { state, viewerId } = fx('4p · discard');
    const viewer = viewerIn(state, viewerId);
    const act = promptFor(fx('4p · opening').state, '0')!;
    // 决斗 is in the deck but Phase 3 hasn't implemented it.
    expect(IMPLEMENTED_EFFECT_KEYS).not.toContain('duel');
    expect(cardBlock(state, viewer, act, idOf('duel'))).toBe('not_implemented');
  });

  it('lets an unimplemented card be *discarded* — discarding is card-agnostic', () => {
    const { state, viewerId } = fx('4p · discard');
    const viewer = viewerIn(state, viewerId);
    const prompt = promptFor(state, viewerId)!;
    expect(cardBlock(state, viewer, prompt, idOf('duel'))).toBeNull();
  });

  it('has a locale key for every reason it can give', () => {
    for (const key of Object.values(CARD_BLOCK_I18N_KEY)) {
      expect(en, `en missing ${key}`).toHaveProperty([key]);
      expect(zh, `zh missing ${key}`).toHaveProperty([key]);
    }
  });
});

describe('targeting', () => {
  it('offers every living opponent for a 杀 — legality (range!) is the server’s call', () => {
    const { state } = fx('8p · midgame');
    const targets = candidateTargets(state, '2', idOf('strike'));
    expect(targets).not.toContain('2'); // self: forbidden
    expect(targets).not.toContain('5'); // dead
    expect(targets).toHaveLength(livingOthers(state, '2'));
    expect(targetRange(idOf('strike'), livingOthers(state, '2'))).toEqual({ min: 1, max: 1 });
  });

  it('offers no seats for a 桃 — it heals the player who plays it', () => {
    const { state } = fx('4p · opening');
    expect(candidateTargets(state, '0', idOf('peach'))).toEqual([]);
    expect(targetRange(idOf('peach'), 3)).toEqual({ min: 0, max: 0 });
  });

  it('has no target hint for an unimplemented card, so it cannot be submitted', () => {
    expect(targetRange(idOf('duel'), 3)).toBeNull();
  });
});

describe('selection', () => {
  const actPrompt = promptFor(fx('4p · opening').state, '0')!;
  const discardPrompt = promptFor(fx('4p · discard').state, '0')!;

  it('replaces the card on a single-card prompt rather than refusing the click', () => {
    const a = toggleCard(EMPTY_SELECTION, actPrompt, 'x');
    const b = toggleCard(a, actPrompt, 'y');
    expect(b.cards).toEqual(['y']);
  });

  it('clears targets when the card changes — a 杀’s target is not a 桃’s', () => {
    const withTarget = { cards: ['x'], targets: ['3'] };
    expect(toggleCard(withTarget, actPrompt, 'y').targets).toEqual([]);
    expect(toggleCard(withTarget, actPrompt, 'x').targets).toEqual([]); // deselect too
  });

  it('accumulates up to the required count on a discard, then ignores extra picks', () => {
    let sel = EMPTY_SELECTION;
    for (const c of ['a', 'b', 'c', 'd']) sel = toggleCard(sel, discardPrompt, c);
    expect(sel.cards).toEqual(['a', 'b', 'c']); // count = 3; 'd' ignored, not rotated in
  });

  it('toggles a card back off — a misclick in a dying window must be undoable', () => {
    const sel = toggleCard(EMPTY_SELECTION, discardPrompt, 'a');
    expect(toggleCard(sel, discardPrompt, 'a').cards).toEqual([]);
  });

  it('replaces the target when only one is allowed', () => {
    const sel = toggleTarget({ cards: ['x'], targets: ['1'] }, '2', 1);
    expect(sel.targets).toEqual(['2']);
  });

  it('resets when the engine asks something new', () => {
    expect(selectionKey('act', ['a', 'b'])).not.toBe(selectionKey('demandCard', ['a', 'b']));
    expect(selectionKey('act', ['a', 'b'])).not.toBe(selectionKey('act', ['a'])); // hand changed
  });
});

describe('canSubmit', () => {
  const { state, viewerId } = fx('4p · opening');
  const prompt = promptFor(state, viewerId)!;
  const others = livingOthers(state, viewerId);

  it('needs the card and its targets before it will enable', () => {
    expect(canSubmit(prompt, EMPTY_SELECTION, others)).toBe(false);
    expect(canSubmit(prompt, { cards: [idOf('strike')], targets: [] }, others)).toBe(false);
    expect(canSubmit(prompt, { cards: [idOf('strike')], targets: ['1'] }, others)).toBe(true);
    expect(canSubmit(prompt, { cards: [idOf('strike')], targets: ['1', '2'] }, others)).toBe(false);
  });

  it('enables a 桃 with no targets at all', () => {
    expect(canSubmit(prompt, { cards: [idOf('peach')], targets: [] }, others)).toBe(true);
  });

  it('refuses to submit a card the server has no effect for', () => {
    expect(canSubmit(prompt, { cards: [idOf('duel')], targets: [] }, others)).toBe(false);
  });

  it('needs exactly the required number of discards — no more, no fewer', () => {
    const d = promptFor(fx('4p · discard').state, '0')!;
    expect(canSubmit(d, { cards: ['a', 'b'], targets: [] }, 3)).toBe(false);
    expect(canSubmit(d, { cards: ['a', 'b', 'c'], targets: [] }, 3)).toBe(true);
  });
});

describe('actions', () => {
  it('sends a decline as the same move with no cards — not a different move', () => {
    const fired: RecordedIntent[] = [];
    const actions = recordingActions((i) => fired.push(i));
    actions.supplyCards(); // declined a 闪
    actions.supplyCards(['peach_3h']); // supplied a 桃
    actions.respondSkill(false); // declined an optional skill
    actions.playCard('strike_2c', ['3']);
    expect(fired).toEqual([
      { move: 'supplyCards', args: [] },
      { move: 'supplyCards', args: [['peach_3h']] },
      { move: 'respondSkill', args: [false] },
      { move: 'playCard', args: ['strike_2c', ['3']] },
    ]);
  });
});

describe('game log', () => {
  const t = (key: string) => (en as Record<string, string>)[key] ?? key;

  it('resolves player ids to generals and card ids to card names', () => {
    const { state } = fx('8p · midgame');
    const entry = { key: 'log.plays_at', params: { player: '0', card: idOf('strike'), target: '2' } };
    const params = resolveLogParams(entry, state, 'en', t);
    expect(params.player).toBe('Cao Cao');
    expect(params.target).toBe('Xiahou Dun'); // seat 2 = generals[2]
    expect(params.card).toBe('Strike');
  });

  it('renders the same entry in Chinese without the engine knowing a language exists', () => {
    const { state } = fx('8p · midgame');
    const entry = { key: 'log.plays_at', params: { player: '0', card: idOf('strike'), target: '2' } };
    const params = resolveLogParams(entry, state, 'zh', (k) => (zh as Record<string, string>)[k] ?? k);
    expect(params.player).toBe('曹操');
    expect(params.card).toBe('杀');
  });

  it('resolves roles and phases through their own key namespaces', () => {
    const { state } = fx('8p · midgame');
    expect(resolveLogParams({ key: 'log.death', params: { target: '5', role: 'rebel' } }, state, 'en', t).role).toBe('Rebel');
    expect(resolveLogParams({ key: 'log.phase', params: { player: '0', phase: 'discard' } }, state, 'en', t).phase).toBe('Discard Phase');
  });

  it('passes counts through untouched', () => {
    const { state } = fx('8p · midgame');
    expect(resolveLogParams({ key: 'log.draws', params: { player: '0', n: 2 } }, state, 'en', t).n).toBe(2);
  });

  // The engine writes nothing to G.log yet (F3) — this vocabulary is the contract
  // Phase 3 should log against, so the keys must exist before the effects do.
  it('has every log key in both locales', () => {
    for (const key of LOG_KEYS) {
      expect(en, `en missing ${key}`).toHaveProperty([key]);
      expect(zh, `zh missing ${key}`).toHaveProperty([key]);
    }
  });
});


// ── "point at one of that player's cards" (3.3's chooseCard) ─────────────
// The second request kind the board was blind to. 3.2's demandCard was caught
// and fixed by 4.1b; this one shipped with 过河拆桥/顺手牵羊 and stalled the
// table on whoever played them.
describe('chooseCard prompt', () => {
  const choose = () => {
    const { state, viewerId } = fx('4p · 过河拆桥 card-pick');
    const prompt = promptFor(state, viewerId);
    if (!prompt) throw new Error('no prompt — the table would stall here');
    return { state, viewerId, prompt };
  };

  it('asks the player who PLAYED the card, not the one losing it', () => {
    const { state, prompt } = choose();
    expect(prompt.kind).toBe('chooseCard');
    expect(state.pending && 'playerId' in state.pending ? state.pending.playerId : null).toBe('0');
    expect(prompt.choiceTarget).toBe('3');
  });

  it('is answered with a slot, not a hand card — so the hand is inert', () => {
    const { state, viewerId, prompt } = choose();
    const viewer = viewerIn(state, viewerId);
    expect(prompt.cardCount).toBe(0);
    expect(cardBlock(state, viewer, prompt, idOf('strike'))).toBe('choose_instead');
    expect(canSubmit(prompt, EMPTY_SELECTION, 3)).toBe(false);
    expect(canSubmit(prompt, { cards: [], targets: [], slot: { z: 'hand', index: 1 } }, 3)).toBe(
      true,
    );
  });

  it('offers exactly the slots the server sent — hand by index, public zones by id', () => {
    const { prompt } = choose();
    const zones = (prompt.choices ?? []).map((c) => c.z);
    expect(zones.filter((z) => z === 'hand')).toHaveLength(3);
    expect(zones).toContain('equip');
    expect(zones).toContain('judgementZone');
    // A hand slot never carries a card id — that would leak suit and rank.
    for (const choice of prompt.choices ?? []) {
      if (choice.z === 'hand') expect(choice).not.toHaveProperty('cardId');
    }
  });

  it('toggles a slot off (a misclick must be undoable), comparing by value not identity', () => {
    const first = chooseSlot(EMPTY_SELECTION, { z: 'hand', index: 2 });
    expect(first.slot).toEqual({ z: 'hand', index: 2 });
    expect(chooseSlot(first, { z: 'hand', index: 2 }).slot).toBeNull();
    expect(sameSlot({ z: 'equip', cardId: 'a' }, { z: 'equip', cardId: 'a' })).toBe(true);
    expect(sameSlot({ z: 'hand', index: 0 }, { z: 'equip', cardId: 'a' })).toBe(false);
  });

  it('has no decline path — the card is already resolving', () => {
    const { prompt } = choose();
    expect(prompt.secondary).toBeNull();
  });

  it('carries the engine’s reasonKey, which names the victim', () => {
    const { prompt } = choose();
    expect(prompt.reasonKey).toBe('choose.dismantle');
    expect(en).toHaveProperty(['choose.dismantle']);
    expect(zh).toHaveProperty(['choose.dismantle']);
  });

  it('fires the slot as the move argument', () => {
    const fired: RecordedIntent[] = [];
    const actions = recordingActions((i) => fired.push(i));
    actions.chooseCard({ z: 'judgementZone', cardId: 'indulgence_6s' });
    expect(fired).toEqual([
      { move: 'chooseCard', args: [{ z: 'judgementZone', cardId: 'indulgence_6s' }] },
    ]);
  });
});

// ── the tripwire that would have caught BOTH gaps ────────────────────────
describe('every request kind the engine can raise has a prompt', () => {
  // A stage the engine can block on and the client has no case for is a table
  // that stalls on whoever is asked — silently, because promptFor() returning
  // null is also what a spectator gets. It has happened twice. This is the
  // check that makes it fail loudly the next time instead.
  const STAGES_WITHOUT_A_PENDING = [
    'chooseGeneral', // not a G.pending request at all — engine/selection.ts
    'orderTriggers', // §3.1 step 3: cold path, no Standard general reaches it
  ];

  it('covers every stage in the shared stage/move map', () => {
    const kinds = Object.keys(THREE_KINGDOMS_STAGE_MOVES).filter(
      (s) => !STAGES_WITHOUT_A_PENDING.includes(s),
    );
    // Pinned, not derived — the point of this line is that ADDING a stage to the
    // shared map is a decision that has to be made here too, in the file that
    // checks the client can answer it. The last seven arrived with Batch B/C
    // (4.3, 4.4) and had no prompt at all for two phases; this list is how that
    // stops being possible to miss.
    expect([...kinds].sort()).toEqual([
      'act',
      'chooseCard',
      'chooseOption',
      'choosePlayer',
      'confirmSkill',
      'declareSuit',
      'demandCard',
      'discard',
      'guanxing',
      'guicaiRetrial',
      'liuliRedirect',
      'yijiDistribute',
    ]);

    for (const kind of kinds) {
      const state: TableState = {
        ...fx('4p · opening').state,
        pending: {
          kind,
          playerId: '0',
          count: 1,
          demandKind: 'dodge',
          target: '1',
          choices: [],
          triggerId: 'jianxiong',
          labelKey: 'skill.jianxiong.name',
        },
      };
      expect(promptFor(state, '0'), `${kind} produces no prompt — the table stalls`).not.toBeNull();
    }
  });

  it('offers a move for every prompt kind — a prompt with no move is a dead end', () => {
    const fired: RecordedIntent[] = [];
    const actions = recordingActions((i) => fired.push(i));
    const moves: Record<string, () => void> = {
      act: () => actions.pass(),
      discard: () => actions.discard([]),
      demandCard: () => actions.supplyCards(),
      confirmSkill: () => actions.respondSkill(false),
      chooseCard: () => actions.chooseCard({ z: 'hand', index: 0 }),
      // Batch B/C (4.3, 4.4). The move NAMES are the shared map's — boardgame.io
      // dispatches by name into a stage by name, so a typo here is invisible: it
      // looks exactly like a server that ignored you.
      chooseOption: () => actions.chooseOption('discard_two'),
      choosePlayer: () => actions.choosePlayer('1'),
      declareSuit: () => actions.declareSuit('hearts'),
      guanxing: () => actions.arrangeCards(['strike_2c']),
      guicaiRetrial: () => actions.submitRetrial('strike_2c'),
      yijiDistribute: () => actions.distributeCards([{ cardId: 'strike_2c', target: '1' }]),
      liuliRedirect: () => actions.redirectStrike('strike_2c', '2'),
    };
    for (const fire of Object.values(moves)) fire();
    expect(fired).toHaveLength(12);

    // Every stage in the shared map that can carry a pending has a move above —
    // the same list the prompt coverage test pins, checked from the other end.
    const covered = Object.keys(moves).sort();
    const kinds = Object.keys(THREE_KINGDOMS_STAGE_MOVES)
      .filter((s) => !STAGES_WITHOUT_A_PENDING.includes(s))
      .sort();
    expect(covered).toEqual(kinds);
  });
});
