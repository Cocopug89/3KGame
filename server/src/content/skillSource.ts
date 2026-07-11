// Where a player's skills come from — the LIVE read that makes "derive, never
// subscribe" (engine-design §4 decision 1, skill-trigger-design §1) true for
// skills the same way equipmentTriggerRegistry makes it true for equipment.
//
// Walk: player → their general's skillIds (content/standard/generals.json, task
// 4.1a) → skillRegistry. No subscription table exists anywhere, so a skill lost
// mid-resolution (a future 换将, a 觉醒技) stops answering immediately, and the
// pop-time re-check in engine/triggers.ts §3.3 is free.
//
// 主公技 (lordOnly) are filtered HERE, in the one place, rather than in each of
// 护驾/激将/救援's when() — a lord skill on a player who is not the lord does not
// exist, it isn't merely inert.

import { generals } from '@3k/shared';
import type { GState, PlayerId } from '../engine/state.js';
import type { SkillTrigger, TriggerSource } from './triggerTypes.js';
import type { QueryProvider, QuerySource } from './queryTypes.js';
import { assertQueryProvider } from './queryTypes.js';
import { PRIORITY_LORD_SKILL, PRIORITY_SKILL } from './triggerTypes.js';
import { skillRegistry } from './skillRegistry.js';
import type { Skill } from './skillTypes.js';

const generalIndex = new Map(generals.map((g) => [g.id, g]));

/** Every skill `owner` currently has, implemented or not-yet-implemented alike
 * (an id in generals.json with no registry entry is simply absent — that is how
 * 4.2/4.3/4.4 can land in batches without the other two batches' generals
 * throwing). */
export function skillsOfPlayer(G: GState, owner: PlayerId): Skill[] {
  const player = G.players[owner];
  if (!player) return [];
  const general = generalIndex.get(player.generalId);
  if (!general) return [];

  const out: Skill[] = [];
  for (const skillId of general.skillIds) {
    const skill = skillRegistry[skillId];
    if (!skill) continue; // declared in the data, not implemented yet
    if (skill.lordOnly && player.role !== 'lord') continue; // 主公技
    out.push(skill);
  }
  return out;
}

export const skillTriggerSource: TriggerSource = {
  name: 'skill',
  triggersFor(G: GState, owner: PlayerId): readonly SkillTrigger[] {
    const out: SkillTrigger[] = [];
    for (const skill of skillsOfPlayer(G, owner)) {
      if (!skill.triggers) continue;
      for (const trigger of skill.triggers) {
        // §3.2's bands: a lord skill proxies for the lord *after* his own
        // skills have had their say, so it sorts last unless it says otherwise.
        out.push({
          ...trigger,
          priority: trigger.priority ?? (skill.lordOnly ? PRIORITY_LORD_SKILL : PRIORITY_SKILL),
        });
      }
    }
    return out;
  },
};

export const skillQuerySource: QuerySource = {
  name: 'skill',
  providersFor(G: GState, owner: PlayerId): readonly QueryProvider[] {
    const out: QueryProvider[] = [];
    for (const skill of skillsOfPlayer(G, owner)) {
      if (!skill.queries) continue;
      out.push(
        assertQueryProvider({
          id: skill.id,
          priority: skill.lordOnly ? PRIORITY_LORD_SKILL : PRIORITY_SKILL,
          locked: skill.locked,
          handlers: skill.queries,
        }),
      );
    }
    return out;
  },
};
