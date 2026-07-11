// Typed accessors for the game's data layer (content/standard/*.json).
// This is the single place client and server both import from — see
// docs/engine-design.md §8 ("the workspace fix 2.2 must do first").
import cardsData from '../../content/standard/cards.json' with { type: 'json' };
import generalsData from '../../content/standard/generals.json' with { type: 'json' };
import skillsData from '../../content/standard/skills.json' with { type: 'json' };
import type { CardData, GeneralData, SkillData } from './types.js';

export const cards = cardsData as CardData[];
export const generals = generalsData as GeneralData[];
/** The 40 Standard-edition skills (task 4.1a). Handlers land in 4.2–4.4; this
 * is the catalog the UI, the registry-completeness test and the skill registry
 * all read from. */
export const skills = skillsData as SkillData[];

/** Skills belonging to a general, in the order generals.json lists them. */
export function skillsOf(generalId: string): SkillData[] {
  return skills.filter((s) => s.generalId === generalId);
}

/** Cards/generals carry both zhName and enName inline (no i18nKey indirection),
 * so the toggle just picks a field rather than doing an i18next lookup. */
export function localizedName(item: { zhName: string; enName: string }, language: string): string {
  return language.startsWith('zh') ? item.zhName : item.enName;
}
