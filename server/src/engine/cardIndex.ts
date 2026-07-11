// Immutable card index built once from content/standard/cards.json at server
// boot. `G` (state.ts) stores only card ids; suit/rank/type/effectKey/range
// come from here. See docs/engine-design.md §1 ("Card data is not in G").
//
// Imports content by package name (@3k/shared), never a relative `../../../`
// reach — server/tsconfig.json's rootDir:"./src" would reject that reach,
// and package-name resolution (via the npm workspace symlink) sidesteps it
// entirely. See docs/engine-design.md §8.

import { cards } from '@3k/shared';
import type { CardData } from '@3k/shared';
import type { CardId } from './state.js';

export type CardDef = CardData;
export type CardIndex = ReadonlyMap<CardId, CardDef>;

export function buildCardIndex(): CardIndex {
  const map = new Map<CardId, CardDef>();
  for (const card of cards) {
    if (map.has(card.id)) {
      throw new Error(`Duplicate card id in content/standard/cards.json: ${card.id}`);
    }
    map.set(card.id, card);
  }
  return map;
}

let cached: CardIndex | null = null;

/** Lazily built, memoised — content/standard/cards.json never changes at
 * runtime, so there's no reason to rebuild the map per call. */
export function getCardIndex(): CardIndex {
  if (!cached) cached = buildCardIndex();
  return cached;
}

export function getCard(id: CardId, index: CardIndex = getCardIndex()): CardDef {
  const card = index.get(id);
  if (!card) throw new Error(`Unknown card id: ${id}`);
  return card;
}
