// The list of places listeners can come from. 3.2 registered one (equipment);
// 4.1b appended the skill source, and that is the whole list — see
// TriggerSource's comment ("nothing else should ever need to"). Deliberately a plain array rather than
// anything cleverer — the whole point of "derive, never subscribe"
// (engine-design §4) is that this stays boring.

import type { TriggerSource } from './triggerTypes.js';
import { equipmentTriggerSource } from './equipmentTriggerRegistry.js';
import { skillTriggerSource } from './skillSource.js';

export const triggerSources: TriggerSource[] = [equipmentTriggerSource, skillTriggerSource];
