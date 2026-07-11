// 过河拆桥 Dismantle (plan §3.2): choose one card of any other player's —
// hand, equipment or judgement zone — and DISCARD it. No range limit.
//
// Everything mechanical is in takeOneCard.ts, which it shares with 顺手牵羊;
// this file is the two lines that actually differ. `nullify` is unset: the
// default for a `type: 'trick'` card is 'once' (effectTypes.ts), so the
// 无懈可击 window comes for free.

import { takeOneCardEffect } from './takeOneCard.js';

export const dismantle = takeOneCardEffect({
  key: 'dismantle',
  reasonKey: 'choose.dismantle',
  destination: () => ({ z: 'discard' }),
});
