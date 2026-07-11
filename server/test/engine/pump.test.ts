import { describe, it, expect } from 'vitest';
import { pump, resolve, pushFrames, applyToResumeFrame } from '../../src/engine/pump.js';
import { makeGState, identityRng } from './fixtures.js';
import type { Frame } from '../../src/engine/frames.js';

describe('resolve', () => {
  it('a request frame sets G.pending and does not push anything else', () => {
    const G = makeGState({ stack: [{ t: 'request', req: { kind: 'act', playerId: '0' } }] });
    resolve(G.stack.pop()!, G, identityRng);
    expect(G.pending).toEqual({ kind: 'act', playerId: '0' });
    expect(G.stack).toEqual([]);
  });

  it('has NOTHING deferred left: an unknown triggerStep drops silently, it does not throw (4.1b)', () => {
    // 'judge'/'trigger' landed in 3.2; the optional-trigger prompt and the
    // limit counters — the last deferral in this file — landed in 4.1b. There
    // is no notImplemented() in pump.ts any more, and that is 4.1b's own
    // definition of done. An owner who no longer has the trigger (equipment
    // stolen mid-fan-out) is the §3.3 pop-time re-check, and it drops the frame
    // rather than throwing.
    const G = makeGState();
    expect(() =>
      resolve(
        {
          t: 'triggerStep',
          ev: { event: 'turn.start', player: '0' },
          owner: '0',
          triggerId: 'nope',
        },
        G,
        identityRng,
      ),
    ).not.toThrow(); // a trigger the owner no longer has drops silently (§3.3)
  });

  it("throws for a 'play'/'effect'/'resume' frame naming an unregistered effectKey", () => {
    const G = makeGState();
    expect(() =>
      resolve({ t: 'effect', effectKey: 'not_a_real_effect', ctx: {} }, G, identityRng),
    ).toThrow(/no registered effect/);
  });

  it("a 'play' frame builds ctx from {source,cards,targets} and dispatches through the registry", () => {
    const G = makeGState();
    G.players['1'].hand = ['dodge_2h1']; // …so the demand has something to ask for
    resolve(
      { t: 'play', source: '0', cards: ['strike_2c'], targets: ['1'], effectKey: 'strike' },
      G,
      identityRng,
    );
    // A play now expands into [trigger(card.play), effect] in narrative order —
    // the event fires before the effect dispatches (skill-trigger-design §2).
    // 杀 is nullify:'none' (a basic card), so the effect frame is unwrapped.
    expect(G.pending).toBeNull();
    expect(G.stack).toHaveLength(2);
    expect(G.stack[1]).toMatchObject({ t: 'trigger', ev: { event: 'card.play', effectKey: 'strike' } });
    expect(G.stack[0]).toMatchObject({ t: 'effect', effectKey: 'strike' });

    // …and draining it gets to the same place 2.4 did — except the target is
    // asked through the generic demand protocol now (4.1b), not a bespoke
    // respondDodge stage.
    pump(G, identityRng);
    expect(G.pending).toMatchObject({ kind: 'demandCard', playerId: '1', demandKind: 'dodge' });
  });

  it("a 'play' frame of a TRICK wraps the effect in a nullification window (default 'once')", () => {
    // 无懈可击 windows are opt-out by card TYPE, not opt-in per card: any trick
    // added later is nullifiable unless it says otherwise
    // (judgement-nullification-design §2.2).
    const G = makeGState();
    resolve(
      { t: 'play', source: '0', cards: ['nullification_js'], targets: [], effectKey: 'nullification' },
      G,
      identityRng,
    );
    // nullification itself declares nullify:'none' — it's never played through
    // 'play' in the first place (it's supplied to a demand), so no window.
    expect(G.stack[0]).toMatchObject({ t: 'effect', effectKey: 'nullification' });
  });

  it("a 'damage' frame reduces hp and drops silently for an already-dead target", () => {
    // Two steps now (§2.1), so drive it with pump() rather than a single
    // resolve(): step 1 publishes the damage to G.damage and opens the
    // damage.before window; step 2 applies whatever survived it.
    const G = makeGState();
    G.players['1'].hp = 3;
    G.stack.push({ t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal' });
    pump(G, identityRng);
    expect(G.players['1'].hp).toBe(2);
    expect(G.damage).toBeNull(); // the window closed behind itself

    G.players['1'].alive = false;
    G.stack.push({ t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal' });
    pump(G, identityRng);
    expect(G.players['1'].hp).toBe(2); // untouched — dead players don't take further damage
  });

  it("a 'damage' frame opens a two-step window over the public G.damage (§2.1)", () => {
    const G = makeGState();
    resolve({ t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal', card: 'strike_2c' }, G, identityRng);

    // Step 1: nothing applied yet, the numbers are public, and the window is
    // open for 裸衣/青釭剑/寒冰剑/仁王盾 to patch them with {t:'setDamage'}.
    expect(G.players['1'].hp).toBe(4);
    expect(G.damage).toEqual({
      source: '0',
      target: '1',
      amount: 1,
      kind: 'normal',
      card: 'strike_2c',
      seq: 1,
    });
    expect([...G.stack].reverse()).toEqual([
      { t: 'trigger', ev: { event: 'damage.before' } },
      { t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal', card: 'strike_2c', windowOpen: true },
    ]);
  });

  it("a listener's {t:'setDamage'} patch is what step 2 applies — the frame is never retro-edited", () => {
    const G = makeGState();
    G.stack.push({ t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal' });
    resolve(G.stack.pop()!, G, identityRng); // step 1

    // 裸衣: +1. (A real trigger would return this frame from effect().)
    resolve({ t: 'setDamage', patch: { amount: 2 } }, G, identityRng);
    pump(G, identityRng); // drains the damage.before fan-out, then step 2

    expect(G.players['1'].hp).toBe(2); // 4 − 2, not 4 − 1
  });

  it('a prevented damage (寒冰剑/仁王盾) applies nothing and emits no damage.after', () => {
    const G = makeGState();
    G.stack.push({ t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal' });
    resolve(G.stack.pop()!, G, identityRng);
    resolve({ t: 'setDamage', patch: { prevented: true } }, G, identityRng);
    pump(G, identityRng);

    expect(G.players['1'].hp).toBe(4);
    expect(G.damage).toBeNull();
    expect(G.stack).toEqual([]);
  });

  it('asserts rather than silently nesting when a second damage window opens (§2.1)', () => {
    const G = makeGState();
    resolve({ t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal' }, G, identityRng);
    expect(() =>
      resolve({ t: 'damage', source: '1', target: '0', amount: 1, kind: 'normal' }, G, identityRng),
    ).toThrow(/still in flight/);
  });

  it("a 'damage' frame that drops hp to 0 or below emits damage.after, THEN opens a dying window", () => {
    const G = makeGState();
    G.players['1'].hp = 1;
    G.stack.push({ t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal' });
    resolve(G.stack.pop()!, G, identityRng); // step 1
    G.stack.pop(); // drop the damage.before trigger — no listeners to run
    resolve(G.stack.pop()!, G, identityRng); // step 2

    expect(G.players['1'].hp).toBe(0);
    // damage.after fires BEFORE the dying check — which is what lets 刚烈's
    // counter-damage and 遗计's draw resolve while their owner is at 0 hp and
    // not yet dead. It is also the single line that unblocks a third of Batch B.
    // The killer is threaded onto the dying frame (3.1 §6) for Phase 5.
    expect([...G.stack].reverse()).toEqual([
      {
        t: 'trigger',
        ev: { event: 'damage.after', source: '0', target: '1', amount: 1, kind: 'normal', seq: 1 },
      },
      { t: 'dying', target: '1', asker: '1', offset: 0, killer: '0' },
    ]);
  });

  it("a 'damage' frame that leaves hp above 0 does not open a dying window", () => {
    const G = makeGState();
    G.players['1'].hp = 3;
    G.stack.push({ t: 'damage', source: '0', target: '1', amount: 1, kind: 'normal' });
    pump(G, identityRng);
    expect(G.players['1'].hp).toBe(2);
    expect(G.stack.some((f) => f.t === 'dying')).toBe(false);
  });

  it("a 'heal' frame raises hp (capped at maxHp) and emits heal.after with who healed", () => {
    const G = makeGState();
    G.players['0'].hp = 2;
    resolve({ t: 'heal', target: '0', amount: 1, source: '1', card: 'peach_3h' }, G, identityRng);
    expect(G.players['0'].hp).toBe(3);
    expect(G.stack).toEqual([
      {
        t: 'trigger',
        ev: { event: 'heal.after', target: '0', source: '1', amount: 1, card: 'peach_3h' },
      },
    ]);
  });

  it("a '{t:flag}' frame writes turn state, and nothing else (§2.2)", () => {
    const G = makeGState();
    resolve({ t: 'flag', key: 'luoyi', value: true }, G, identityRng);
    expect(G.turnFlags.luoyi).toBe(true);
    expect(G.stack).toEqual([]);
  });
});

describe("resolve('dying', ...)", () => {
  it('drops silently if the target has since been saved (hp > 0)', () => {
    const G = makeGState();
    G.players['0'].hp = 1;
    resolve({ t: 'dying', target: '0', asker: '0', offset: 0 }, G, identityRng);
    expect(G.stack).toEqual([]);
    expect(G.pending).toBeNull();
  });

  it('drops silently if the target is already dead', () => {
    const G = makeGState();
    G.players['0'].hp = 0;
    G.players['0'].alive = false;
    resolve({ t: 'dying', target: '0', asker: '0', offset: 0 }, G, identityRng);
    expect(G.stack).toEqual([]);
  });

  it('emits the dying event exactly once — when the window OPENS (offset 0)', () => {
    const G = makeGState();
    G.players['0'].hp = 0;
    resolve({ t: 'dying', target: '0', asker: '0', offset: 0, killer: null }, G, identityRng);
    expect([...G.stack].reverse()).toEqual([
      { t: 'trigger', ev: { event: 'dying', target: '0' } },
      // …then re-enters itself to do the asking. A listener that heals the
      // target closes the window on THIS frame's own hp check.
      { t: 'dying', target: '0', asker: '0', offset: 0, killer: null, notified: true },
    ]);
  });

  it('asks the asker at this offset for a 桃 through the DEMAND protocol (4.1b)', () => {
    const G = makeGState();
    G.players['0'].hp = 0;
    G.players['0'].hand = ['peach_3h']; // offset 0 = the dying player themselves
    resolve(
      { t: 'dying', target: '0', asker: '0', offset: 0, killer: null, notified: true },
      G,
      identityRng,
    );
    // No bespoke respondPeach request — a demand, whose "can they answer?"
    // check folds queries.cardsAs and is therefore the one place 华佗's 急救
    // (any red card, as a 桃, for someone else) can ever hook in.
    expect([...G.stack].reverse()).toEqual([
      {
        t: 'demand',
        kind: 'peach',
        from: '0',
        by: null,
        count: 1,
        reasonKey: 'demand.peach',
        subject: '0',
      },
      {
        t: 'resume',
        effectKey: 'dying_window',
        ctx: { target: '0', asker: '0', offset: 0, killer: null },
      },
    ]);
  });

  it('the "holds no 桃 ⇒ never asked" skip now lives in {t:demandAsk}, not here', () => {
    // The dying window asks EVERY living player in turn; the demand is what
    // decides whether the question is worth a round-trip. Pumping the whole
    // thing with nobody holding a 桃 walks straight to death without ever
    // setting G.pending.
    const G = makeGState({ activeSeat: 1 });
    G.players['0'].hp = 0;
    G.stack.push({ t: 'dying', target: '0', asker: '0', offset: 0, killer: null });
    pump(G, identityRng);
    expect(G.pending).toBeNull();
    expect(G.players['0'].alive).toBe(false);
  });

  it('resolves death once offset has walked past every living player', () => {
    const G = makeGState({ activeSeat: 1 }); // '1' is the turn player, so '0' dying doesn't end the turn
    G.players['0'].hp = 0;
    resolve(
      { t: 'dying', target: '0', asker: '1', offset: 2, killer: '1', notified: true },
      G,
      identityRng,
    );
    expect(G.players['0'].alive).toBe(false);
    expect(G.players['0'].roleRevealed).toBe(true);
    // A death emits its event (skill-trigger-design §2), and task 5.3's 奖惩
    // rides in behind it: the fixture's dead player is a Rebel, so their killer
    // collects the three-card bounty (engine/dying.ts's deathConsequenceFrames).
    expect([...G.stack].reverse()).toEqual([
      { t: 'trigger', ev: { event: 'death', target: '0', killer: '1' } },
      { t: 'draw', player: '1', count: 3 },
    ]);
  });
});

describe('pushFrames', () => {
  it('pushes narrative-order frames so frames[0] ends up on top (pops first)', () => {
    const G = makeGState();
    const a: Frame = { t: 'phase', phase: 'prep' };
    const b: Frame = { t: 'phase', phase: 'judge' };
    const c: Frame = { t: 'phase', phase: 'draw' };
    pushFrames(G, [a, b, c]);
    expect(G.stack).toEqual([c, b, a]); // a is on top (last element = top of array = end of stack)
    expect(G.stack.pop()).toBe(a);
    expect(G.stack.pop()).toBe(b);
    expect(G.stack.pop()).toBe(c);
  });
});

describe('applyToResumeFrame', () => {
  it("merges a patch into the ctx of the 'resume' frame on top of the stack", () => {
    const G = makeGState({ stack: [{ t: 'resume', effectKey: 'strike', ctx: { a: 1 } }] });
    applyToResumeFrame(G, { b: 2 });
    expect(G.stack[0]).toEqual({ t: 'resume', effectKey: 'strike', ctx: { a: 1, b: 2 } });
  });

  it('throws if the top of the stack is not a resume frame', () => {
    const G = makeGState({ stack: [{ t: 'phase', phase: 'prep' }] });
    expect(() => applyToResumeFrame(G, {})).toThrow(/expected a 'resume' frame/);
  });

  it('throws on an empty stack', () => {
    const G = makeGState({ stack: [] });
    expect(() => applyToResumeFrame(G, {})).toThrow(/expected a 'resume' frame/);
  });
});

describe('pump', () => {
  it('drains phase frames until it hits a blocking request', () => {
    const G = makeGState({ drawPile: ['a', 'b'], stack: [{ t: 'phase', phase: 'prep' }] });
    pump(G, identityRng);
    // prep -> judge -> draw (draws 2) -> action pushes a request and blocks
    expect(G.pending).toEqual({ kind: 'act', playerId: '0' });
    expect(G.players['0'].hand).toEqual(['a', 'b']);
    expect(G.turnPhase).toBe('action');
  });

  it('does nothing once the stack is empty', () => {
    const G = makeGState({ stack: [] });
    pump(G, identityRng);
    expect(G.pending).toBeNull();
    expect(G.stack).toEqual([]);
  });

  it('stops immediately if G.gameOver is already set, even with frames on the stack', () => {
    const G = makeGState({
      stack: [{ t: 'phase', phase: 'prep' }],
      gameOver: { winners: ['0'], condition: 'lord' },
    });
    pump(G, identityRng);
    expect(G.stack).toHaveLength(1); // untouched
  });
});
