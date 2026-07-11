// Shared type shapes for content/standard/*.json. Content is data, not code —
// this file only adds TypeScript shapes; it must never contain game logic or
// hardcoded display strings. See docs/three-kingdoms-plan.md §5.

export type CardType = 'basic' | 'trick' | 'equipment';
export type EquipmentType = 'weapon' | 'armour' | 'horse';
export type Kingdom = 'wei' | 'shu' | 'wu' | 'qun';

export interface CardData {
  id: string;
  zhName: string;
  enName: string;
  type: CardType;
  suit: string;
  rank: string;
  position: string;
  /** Registry key the engine dispatches on (content/standard/effects/<effectKey>.ts).
   *  One key per *card name*, shared by all copies. Horses are grouped by
   *  direction ('plus_horse' / 'minus_horse') rather than by individual card
   *  name — see docs/engine-design.md §1 and plan §3.3. */
  effectKey: string;
  equipmentType?: EquipmentType;
  /** Horses only: −1 (you are closer to others) or +1 (others are farther from you). */
  horseDirection?: -1 | 1;
  /** Weapons only: attack range in seats. */
  range?: number;
}

export type Gender = 'male' | 'female';

export interface GeneralData {
  id: string;
  zhName: string;
  enName: string;
  kingdom: Kingdom;
  /** 结姻 (Sun Shangxiang) and 离间 (Diao Chan) target male characters only. */
  gender: Gender;
  maxHp: number;
  /** Registry keys into content/standard/skills.json (task 4.1a). */
  skillIds: string[];
}

/** How the engine consults a skill — see docs/skill-trigger-design.md §0.
 *  A skill may have more than one face (裸衣 is both a trigger and a query). */
export type SkillKind = 'trigger' | 'query' | 'active';

export interface SkillData {
  id: string;
  zhName: string;
  enName: string;
  generalId: string;
  /** 锁定技 — never prompts. Only locked skills may answer the query folds
   *  (docs/skill-trigger-design.md §4), since a fold cannot stop and ask. */
  locked: boolean;
  /** 主公技 — only live while its owner holds the 'lord' role. */
  lordOnly?: boolean;
  kind: SkillKind[];
  /** Implementation gotchas / source variances, carried with the data so they
   *  can't be lost: see docs/skill-trigger-design.md §8 and §11. */
  note?: string;
}
