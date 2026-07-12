import { useMemo, useState } from 'react';
import type { TableActions } from '../../game/actions';
import {
  EMPTY_SELECTION,
  assignCard,
  chooseSlot,
  pickOption,
  pickPlayer,
  pickSuit,
  selectionKey,
  toggleCard,
  toggleOrder,
  toggleTarget,
} from '../../game/interaction';
import type { Selection } from '../../game/interaction';
import {
  autoTargets,
  candidateTargets,
  livingOthers as countLivingOthers,
  promptFor,
  targetRange,
  viewerOf,
} from '../../game/prompts';
import { useTransitions } from '../../game/useTransitions';
import { ringPositions, seatsForViewer } from '../../game/viewModel';
import type { CardSlot, TableState } from '../../game/viewTypes';
import { ChoicePanel } from './ChoicePanel';
import { GameLog } from './GameLog';
import { HandZone } from './HandZone';
import { PlayerSeat } from './PlayerSeat';
import { PromptPanel } from './PromptPanel';
import { TableCenter } from './TableCenter';
import './table.css';

interface GameTableProps {
  /** The playerView-shaped state, exactly as a boardgame.io client receives it. */
  state: TableState;
  /** boardgame.io playerID. Null = spectator (no hand, no own seat, no prompt). */
  viewerId: string | null;
  /** Omitted = read-only board (6.1's behaviour). Provided = the prompt fires moves. */
  actions?: TableActions;
  /** The server answered INVALID_MOVE to the last move we sent. */
  rejected?: boolean;
}

/**
 * The table (6.1) plus the interaction layer (6.2).
 *
 * Layout: the viewer sits at the bottom, opponents ring the table in seat order
 * running clockwise from the viewer's left. Seats are positioned as percentages
 * so 4- and 8-player games use one code path.
 *
 * Interaction: everything hangs off `G.pending` — the only thing that ever
 * blocks the engine. If it names you, you get a prompt, a filtered hand, and
 * (for an action-phase play) clickable seats; if it doesn't, the board is inert
 * and says who it's waiting on. No rules are evaluated here: the client offers,
 * the server decides, and an INVALID_MOVE comes back as `rejected`.
 *
 * Selection is keyed to the prompt + the hand, so it resets the moment the
 * engine asks something new — a 闪 half-selected when the window closes must not
 * survive into the next question.
 */
export function GameTable({ state, viewerId, actions, rejected = false }: GameTableProps) {
  const { self, others } = seatsForViewer(state, viewerId);
  const positions = ringPositions(others.length);

  // 6.3: the server sends snapshots, not events, so what "just happened" is
  // derived by diffing this state against the last one we rendered.
  const fx = useTransitions(state);

  const viewer = viewerOf(state, viewerId);
  const prompt = actions ? promptFor(state, viewerId) : null;
  const livingOthers = viewerId ? countLivingOthers(state, viewerId) : 0;

  const key = selectionKey(prompt?.kind ?? null, viewer?.hand ?? []);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [selectionFor, setSelectionFor] = useState(key);
  if (selectionFor !== key) {
    // Render-phase reset (React's "derive state from props" escape hatch) rather
    // than an effect: the alternative renders one frame of stale selection.
    setSelectionFor(key);
    setSelection(EMPTY_SELECTION);
  }

  const candidates = useMemo(() => {
    if (!prompt?.needsTargets || !viewerId || selection.cards.length === 0) return [];
    return candidateTargets(state, viewerId, selection.cards[0]);
  }, [prompt, state, viewerId, selection.cards]);

  const maxTargets =
    selection.cards.length > 0 ? (targetRange(selection.cards[0], livingOthers)?.max ?? 0) : 0;

  const onToggleCard = (cardId: string) =>
    setSelection((cur) => {
      if (!prompt) return cur;
      const next = toggleCard(cur, prompt, cardId);
      // AoE tricks (南蛮/万箭/桃园) hit every eligible seat by rule — fill the
      // targets in the same click, so the player never has to pick them.
      if (viewerId && prompt.kind === 'act' && next.cards[0] === cardId) {
        const auto = autoTargets(state, viewerId, cardId);
        if (auto) return { ...next, targets: auto };
      }
      return next;
    });

  const onTarget = (playerId: string) =>
    setSelection((cur) => {
      // An AoE's target list is the rulebook's, not the player's — seat clicks
      // must not carve seats out of it.
      if (viewerId && cur.cards[0] && autoTargets(state, viewerId, cur.cards[0])) return cur;
      return toggleTarget(cur, playerId, maxTargets);
    });

  const onChooseSlot = (slot: CardSlot) => setSelection((cur) => chooseSlot(cur, slot));

  // Batch B/C pickers (4.3, 4.4). Each owns one field of the selection, so 流离
  // can hold a card and a seat at once without either clobbering the other.
  const onPickOption = (optionId: string) => setSelection((cur) => pickOption(cur, optionId));
  const onPickPlayer = (playerId: string) => setSelection((cur) => pickPlayer(cur, playerId));
  const onPickSuit = (suit: string) => setSelection((cur) => pickSuit(cur, suit));
  const onToggleOrder = (cardId: string) => setSelection((cur) => toggleOrder(cur, cardId));
  const onAssign = (cardId: string, target: string) =>
    setSelection((cur) => assignCard(cur, cardId, target));

  const submit = () => {
    if (!actions || !prompt) return;
    const [card] = selection.cards;
    switch (prompt.kind) {
      case 'act':
        actions.playCard(card, selection.targets);
        break;
      // ONE branch for every demanded card (4.1b): 闪, 桃, 杀, 无懈可击. `count`
      // may be more than one (无双), so the whole selection goes.
      case 'demandCard':
        actions.supplyCards(selection.cards);
        break;
      case 'confirmSkill':
        actions.respondSkill(true);
        break;
      case 'discard':
        actions.discard(selection.cards);
        break;
      // The answer is one of the TARGET's cards, not one of yours (3.3).
      case 'chooseCard':
        if (selection.slot) actions.chooseCard(selection.slot);
        break;

      // ── Batch B / C (4.3, 4.4) ────────────────────────────────────────
      // Guarded on the same fields canSubmit() gates the button on, so these
      // can't fire half an answer even if something else enables the button.
      case 'chooseOption':
        if (selection.option) actions.chooseOption(selection.option);
        break;
      case 'choosePlayer':
        if (selection.player) actions.choosePlayer(selection.player);
        break;
      case 'declareSuit':
        if (selection.suit) actions.declareSuit(selection.suit);
        break;
      case 'guanxing':
        if (selection.order) actions.arrangeCards(selection.order);
        break;
      case 'guicaiRetrial':
        if (card) actions.submitRetrial(card);
        break;
      case 'yijiDistribute':
        if (selection.assignments) actions.distributeCards(selection.assignments);
        break;
      // Two-part answer: the card is the cost, the seat is the effect.
      case 'liuliRedirect':
        if (card && selection.player) actions.redirectStrike(card, selection.player);
        break;
    }
    setSelection(EMPTY_SELECTION);
  };

  const secondary = () => {
    if (!actions || !prompt) return;
    if (prompt.secondary === 'pass') actions.pass();
    // Declining is the *absence* of a card, not a different move — the same
    // move with no argument (see bgio/game.ts's supplyCards).
    if (prompt.secondary === 'decline' && prompt.kind === 'demandCard') actions.supplyCards();
    if (prompt.secondary === 'decline' && prompt.kind === 'confirmSkill') actions.respondSkill(false);
    // 突袭 stops early (a real answer — it takes from *up to* two players), and
    // 鬼才 walks away from a retrial it already said yes to. Both are `null`, and
    // both are moves: the engine is blocked until one arrives.
    if (prompt.secondary === 'decline' && prompt.kind === 'choosePlayer') actions.choosePlayer(null);
    if (prompt.secondary === 'decline' && prompt.kind === 'guicaiRetrial') actions.submitRetrial(null);
    setSelection(EMPTY_SELECTION);
  };

  return (
    <div className="table">
      <div className="table__ring">
        {others.map((seatView, i) => (
          <div
            key={seatView.playerId}
            className="table__seat-slot"
            style={{ left: `${positions[i].leftPct}%`, top: `${positions[i].topPct}%` }}
          >
            <PlayerSeat
              seatView={seatView}
              compact
              targetable={candidates.includes(seatView.playerId)}
              targeted={selection.targets.includes(seatView.playerId)}
              onTarget={onTarget}
              fxClass={fx.seatClasses[seatView.playerId]}
            />
          </div>
        ))}

        <div className="table__center-slot">
          <TableCenter state={state} viewerId={viewerId} playedCardId={fx.playedCardId} />
        </div>
      </div>

      <div className="table__bottom">
        {self ? (
          <PlayerSeat
            seatView={self}
            targetable={candidates.includes(self.playerId)}
            targeted={selection.targets.includes(self.playerId)}
            onTarget={onTarget}
            fxClass={fx.seatClasses[self.playerId]}
          />
        ) : null}

        <HandZone
          state={state}
          player={viewer}
          prompt={prompt}
          selectedCards={selection.cards}
          onToggleCard={onToggleCard}
        />

        <div className="table__side">
          {prompt?.kind === 'chooseCard' && prompt.choices && prompt.choiceTarget ? (
            <ChoicePanel
              state={state}
              targetId={prompt.choiceTarget}
              choices={prompt.choices}
              selected={selection.slot}
              onChoose={onChooseSlot}
            />
          ) : null}
          {prompt && viewerId ? (
            <PromptPanel
              state={state}
              viewerId={viewerId}
              prompt={prompt}
              selection={selection}
              livingOthers={livingOthers}
              onSubmit={submit}
              onSecondary={secondary}
              rejected={rejected}
              onPickOption={onPickOption}
              onPickPlayer={onPickPlayer}
              onPickSuit={onPickSuit}
              onToggleOrder={onToggleOrder}
              onAssign={onAssign}
            />
          ) : null}
          <GameLog state={state} />
        </div>
      </div>
    </div>
  );
}
