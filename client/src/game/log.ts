// The game log's rendering contract (task 6.2).
//
// ⚠️ `G.log` is only just starting to be written — that's finding **F3** of the
// Phase 2 review. Task 5.3 wrote the first three keys the engine actually emits
// (`log.death` with the revealed role, `log.kill_reward`, `log.kill_penalty`,
// `log.game_over`); everything else below is still *specification* — the key
// vocabulary and the parameter names the engine should emit as Phase 3/4 land
// (the review's advice: log as each effect lands, don't back-fill 40 effects
// later). If the engine emits a key not listed in LOG_KEYS it still renders —
// i18next resolves the key from the locale files, which is the whole point of
// `LogEntry` being `{key, params}` and never text — but the key must exist in
// zh.json AND en.json, and a test here enforces that for the vocabulary below.
//
// Parameter names are fixed by convention rather than per-key schemas, so the
// engine can emit `{player, card}` without the client knowing what the key means:
//
//   player | target | source | asker  → a PlayerId  → rendered as that seat's general
//   card                              → a CardId    → rendered as that card's name
//   cards                             → CardId[]    → names, joined
//   role                              → a Role      → rendered via role.*
//   phase                             → a TurnPhase → rendered via phase.*
//   n                                 → a number    → passed through
//
// Anything else is passed through untouched.

import { useTranslation } from 'react-i18next';
import { localizedName } from '@3k/shared';
import { cardById, generalById } from './cardIndex.js';
import { PHASE_I18N_KEY } from './viewModel.js';
import type { LogEntryView, TableState, TurnPhase } from './viewTypes.js';

/** The vocabulary Phase 3+ should log against. Keys, never sentences. */
export const LOG_KEYS = [
  'log.turn_start', // {player}
  'log.phase', // {player, phase}
  'log.draws', // {player, n}
  'log.plays', // {player, card}            — no target (桃, equipment)
  'log.plays_at', // {player, card, target}   — 杀 and friends
  'log.responds', // {player, card}            — a 闪 answering a 杀
  'log.declines', // {player}                  — no answer given
  'log.damage', // {target, n, source}
  'log.heal', // {target, n}
  'log.dying', // {target}
  'log.rescued', // {target, player}         — saved by someone else's 桃
  'log.death', // {target, role}             — the hidden-role reveal (5.3)
  'log.discards', // {player, cards}
  'log.equips', // {player, card}
  'log.judgement', // {player, card}
  'log.kill_reward', // {player, n}          — killed a Rebel, draws 3 (5.3)
  'log.kill_penalty', // {player}            — the Lord killed a Loyalist (5.3)
  'log.game_over', // {role}                 — the winning side (5.3)
  'log.card_taken', // {player, target, card} — a card changes hands outside a discard (3.4's 借刀杀人)
  'log.reveals', // {player, n}             — N cards revealed face-up off the draw pile (3.4's 五谷丰登)
  'log.picks', // {player, card}            — a player takes one of the revealed cards (3.4's 五谷丰登)
] as const;

type ResolvedParams = Record<string, unknown>;

const PLAYER_PARAMS = ['player', 'target', 'source', 'asker'] as const;

/**
 * Turns the engine's ids into display strings. Kept separate from the component
 * so it can be tested directly, and so the same entry renders correctly in
 * either language without the engine knowing a language exists.
 */
export function resolveLogParams(
  entry: LogEntryView,
  state: TableState,
  language: string,
  t: (key: string) => string,
): ResolvedParams {
  const params = entry.params ?? {};
  const out: ResolvedParams = { ...params };

  const playerName = (id: unknown): string => {
    if (typeof id !== 'string') return String(id);
    const player = state.players[id];
    const general = player ? generalById(player.generalId) : undefined;
    return general ? localizedName(general, language) : id;
  };

  const cardName = (id: unknown): string => {
    if (typeof id !== 'string') return String(id);
    const card = cardById(id);
    return card ? localizedName(card, language) : id;
  };

  for (const key of PLAYER_PARAMS) {
    if (key in params) out[key] = playerName(params[key]);
  }
  if ('card' in params) out.card = cardName(params.card);
  if (Array.isArray(params.cards)) out.cards = params.cards.map(cardName).join('、');
  if (typeof params.role === 'string') out.role = t(`role.${params.role}`);
  if (typeof params.phase === 'string') {
    out.phase = t(PHASE_I18N_KEY[params.phase as TurnPhase] ?? params.phase);
  }
  return out;
}

/** Hook form, for the component. Returns the rendered line for one entry. */
export function useLogLine(state: TableState): (entry: LogEntryView) => string {
  const { t, i18n } = useTranslation();
  return (entry) => t(entry.key, resolveLogParams(entry, state, i18n.language, t));
}
