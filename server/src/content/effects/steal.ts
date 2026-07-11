// 顺手牵羊 Steal (plan §3.2): choose one card of another player's — hand,
// equipment or judgement zone — and TAKE it into your own hand. Distance ≤ 1,
// which is the only rules difference from 过河拆桥 (`inRange: 'distance_1'` is
// interpreted by validateTargets/distance.ts, like 杀's attack range).
//
// A stolen piece of equipment lands in the hand as an ordinary card — it is
// *not* re-equipped on the thief. `moveCards`'s `to: {z:'hand'}` is exactly
// that, so nothing here has to say so.

import { takeOneCardEffect } from './takeOneCard.js';

export const steal = takeOneCardEffect({
  key: 'steal',
  reasonKey: 'choose.steal',
  inRange: 'distance_1',
  destination: (source) => ({ z: 'hand', player: source }),
});
