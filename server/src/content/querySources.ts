// The list of places query handlers can come from — the exact parallel of
// triggerSources.ts, and deliberately just as boring (engine-design §4).
//
// Equipment first, skills second: §3.2's priority bands are what make "stack a
// 诸葛连弩 under a 咆哮" a defined outcome rather than an accident of iteration
// order, and the chained folds (strikeLimit, drawCount, demandCount,
// targetLimit, distanceModifier) run in exactly this order.

import type { QuerySource } from './queryTypes.js';
import { equipmentQuerySource } from './equipmentQueryRegistry.js';
import { skillQuerySource } from './skillSource.js';

export const querySources: QuerySource[] = [equipmentQuerySource, skillQuerySource];
