// Equipment's side of the query fold (docs/skill-trigger-design.md §4) — keyed
// by the same `effectKey` as the card itself (content/standard/cards.json), so
// an equipped 诸葛连弩 answers `strikeLimit` simply by sitting in a slot.
//
// Task 3.6 fills this in: 诸葛连弩 -> strikeLimit: Infinity · 丈八蛇矛 -> cardsAs
// two hand cards as a 杀 · 方天画戟 -> targetLimit · 青龙偃月刀 also contributes a
// strikeLimit handler here (reading the turn flag its trigger writes —
// greenDragonBlade.ts). 马术-shaped horse effects are already handled by
// distance.ts's own horse arithmetic, not here.
//
// ⚠️ Equipment is ALWAYS locked (锁定技): a weapon has no opinion to ask about,
// and the four un-askable folds are exactly the ones weapons answer. That is
// why every provider below is built with `locked: true`.

import type { GState, PlayerId } from '../engine/state.js';
import type { QueryHandlers, QueryProvider, QuerySource } from './queryTypes.js';
import { assertQueryProvider } from './queryTypes.js';
import { PRIORITY_EQUIPMENT } from './triggerTypes.js';
import { getCard } from '../engine/cardIndex.js';

import { zhugeCrossbowQuery } from './effects/zhugeCrossbow.js';
import { serpentSpearQuery } from './effects/serpentSpear.js';
import { heavenScorcherQuery } from './effects/heavenScorcher.js';
import { greenDragonBladeQuery } from './effects/greenDragonBlade.js';

export const equipmentQueryRegistry: Record<string, Partial<QueryHandlers>> = {
  zhuge_crossbow: zhugeCrossbowQuery,
  serpent_spear: serpentSpearQuery,
  heaven_scorcher: heavenScorcherQuery,
  green_dragon_blade: greenDragonBladeQuery,
};

export const equipmentQuerySource: QuerySource = {
  name: 'equipment',
  providersFor(G: GState, owner: PlayerId): readonly QueryProvider[] {
    const player = G.players[owner];
    if (!player) return [];
    const out: QueryProvider[] = [];
    for (const cardId of Object.values(player.equipment)) {
      if (!cardId) continue;
      const handlers = equipmentQueryRegistry[getCard(cardId).effectKey];
      if (!handlers) continue;
      out.push(
        assertQueryProvider({
          id: getCard(cardId).effectKey,
          priority: PRIORITY_EQUIPMENT,
          locked: true,
          handlers,
        }),
      );
    }
    return out;
  },
};
