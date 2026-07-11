// Display-side content index: id → data, for cards and generals. The engine has
// its own card index (server/src/engine/cardIndex.ts); this one exists because
// the client can't import from the server workspace, and it is display-only —
// it never decides anything, it just turns an id the server sent us into a face
// we can draw.

import { cards, generals, type CardData, type GeneralData } from '@3k/shared';

const cardsById = new Map<string, CardData>(cards.map((c) => [c.id, c]));
const generalsById = new Map<string, GeneralData>(generals.map((g) => [g.id, g]));

/** Undefined rather than throwing: an id we can't resolve should render as an
 * unknown face, not blank the whole table. */
export function cardById(id: string): CardData | undefined {
  return cardsById.get(id);
}

export function generalById(id: string): GeneralData | undefined {
  return generalsById.get(id);
}

export const SUIT_SYMBOL: Record<string, string> = {
  spades: '♠',
  hearts: '♥',
  clubs: '♣',
  diamonds: '♦',
};

export function isRedSuit(suit: string): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}
