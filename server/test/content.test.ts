/**
 * Content integrity tests — the guard rail for `content/standard/*.json` and `locales/*.json`.
 *
 * These are deliberately *data* tests, not engine tests. The whole project rests on this data
 * being right (a wrong suit silently changes every judgement in the game), and it was previously
 * only ever eyeballed. Anything that adds or edits a card, a general or a locale key should be
 * run against this file before it's called done.
 *
 * Sources of truth: docs/card-suit-rank-table.md (cards), docs/three-kingdoms-plan.md §3 (counts)
 * and docs/skill-trigger-design.md §8 (skills).
 */
import { describe, it, expect } from 'vitest';
import cards from '../../content/standard/cards.json';
import generals from '../../content/standard/generals.json';
import skills from '../../content/standard/skills.json';
import en from '../../locales/en.json';
import zh from '../../locales/zh.json';

type Card = (typeof cards)[number] & {
  equipmentType?: string;
  horseDirection?: number;
  effectKey: string;
  range?: number;
};
type General = (typeof generals)[number];
type Skill = (typeof skills)[number] & { lordOnly?: boolean; note?: string };

const allCards = cards as Card[];
const allGenerals = generals as General[];
const allSkills = skills as Skill[];

const SUIT_SYMBOL: Record<string, string> = {
  spades: '♠',
  hearts: '♥',
  clubs: '♣',
  diamonds: '♦',
};

const countByName = (name: string) => allCards.filter((c) => c.enName === name).length;

describe('cards.json', () => {
  it('has exactly 107 cards (plan §3: 53 basic + 35 trick + 19 equipment)', () => {
    expect(allCards).toHaveLength(107);
    expect(allCards.filter((c) => c.type === 'basic')).toHaveLength(53);
    expect(allCards.filter((c) => c.type === 'trick')).toHaveLength(35);
    expect(allCards.filter((c) => c.type === 'equipment')).toHaveLength(19);
  });

  it('has unique, ASCII, slug-shaped ids', () => {
    const ids = allCards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Non-ASCII ids break filenames (content/standard/skills/<id>.ts), registry keys and URLs.
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
  });

  it('uses only the four suits and thirteen ranks', () => {
    for (const c of allCards) {
      expect(Object.keys(SUIT_SYMBOL)).toContain(c.suit);
      expect(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']).toContain(c.rank);
    }
  });

  it('keeps `position` consistent with suit + rank', () => {
    for (const c of allCards) {
      // Two cards carry an "(EX)" print-run annotation — see docs/card-suit-rank-table.md.
      const bare = c.position.replace(/\(EX\)$/, '');
      expect(bare).toBe(`${c.rank}${SUIT_SYMBOL[c.suit]}`);
    }
  });

  it('matches the canonical per-card counts (plan §3.1–§3.3)', () => {
    expect(countByName('Strike')).toBe(30);
    expect(countByName('Dodge')).toBe(15);
    expect(countByName('Peach')).toBe(8);
    expect(countByName('Dismantle')).toBe(6);
    expect(countByName('Steal')).toBe(5);
    expect(countByName('Draw Two')).toBe(4);
    expect(countByName('Duel')).toBe(3);
    expect(countByName('Barbarian Invasion')).toBe(3);
    expect(countByName('Indulgence')).toBe(3);
    expect(countByName('Nullification')).toBe(3);
    expect(countByName('Harvest')).toBe(2);
    expect(countByName('Duress')).toBe(2);
    expect(countByName('Lightning')).toBe(2);
    expect(countByName('Raining Arrows')).toBe(1);
    expect(countByName('Peach Garden')).toBe(1);
    // 诸葛连弩 is the only duplicated equipment card.
    expect(countByName('Zhuge Crossbow')).toBe(2);
    expect(countByName('Eight Trigrams')).toBe(2);
    expect(countByName('Renwang Shield')).toBe(1);
  });

  it('gives every equipment card a slot, and every horse a direction', () => {
    const equipment = allCards.filter((c) => c.type === 'equipment');
    for (const c of equipment) {
      expect(['weapon', 'armour', 'horse']).toContain(c.equipmentType);
    }
    expect(equipment.filter((c) => c.equipmentType === 'weapon')).toHaveLength(10); // 9 weapons, crossbow ×2
    expect(equipment.filter((c) => c.equipmentType === 'armour')).toHaveLength(3); // 八卦阵 ×2 + 仁王盾
    const horses = equipment.filter((c) => c.equipmentType === 'horse');
    expect(horses).toHaveLength(6);
    expect(horses.filter((h) => h.horseDirection === -1)).toHaveLength(3);
    expect(horses.filter((h) => h.horseDirection === 1)).toHaveLength(3);
  });

  it('gives every card an effectKey, and every weapon (only) a range (task 2.2a)', () => {
    for (const c of allCards) {
      expect(c.effectKey, `${c.id} missing effectKey`).toBeTruthy();
    }
    const weapons = allCards.filter((c) => c.equipmentType === 'weapon');
    const nonWeapons = allCards.filter((c) => c.equipmentType !== 'weapon');
    for (const c of weapons) {
      expect(c.range, `${c.id} (weapon) missing range`).toBeGreaterThan(0);
    }
    for (const c of nonWeapons) {
      expect(c.range, `${c.id} (non-weapon) should not have range`).toBeUndefined();
    }
  });

  it('gives every card name its own effectKey, shared by all copies of that name', () => {
    const keysByName = new Map<string, Set<string>>();
    for (const c of allCards) {
      const set = keysByName.get(c.enName) ?? new Set<string>();
      set.add(c.effectKey);
      keysByName.set(c.enName, set);
    }
    for (const [name, keys] of keysByName) {
      expect(keys.size, `${name} has inconsistent effectKeys: ${[...keys]}`).toBe(1);
    }
  });

  it('gives the 9 distinct weapons the plan §3.3 range values', () => {
    const rangeByEffectKey = new Map<string, number>();
    for (const c of allCards.filter((c) => c.equipmentType === 'weapon')) {
      rangeByEffectKey.set(c.effectKey, c.range!);
    }
    expect(Object.fromEntries(rangeByEffectKey)).toEqual({
      zhuge_crossbow: 1,
      gender_swords: 2,
      blue_steel_sword: 2,
      frost_blade: 2,
      rock_cleaving_axe: 3,
      green_dragon_blade: 3,
      serpent_spear: 3,
      heaven_scorcher: 4,
      unicorn_bow: 5,
    });
  });

  it('groups horses by direction, not by individual card name (plan §3.3)', () => {
    const horses = allCards.filter((c) => c.equipmentType === 'horse');
    for (const h of horses) {
      const expected = h.horseDirection === 1 ? 'plus_horse' : 'minus_horse';
      expect(h.effectKey, `${h.id}`).toBe(expected);
    }
  });
});

describe('generals.json', () => {
  it('has 25 generals with the standard kingdom split', () => {
    expect(allGenerals).toHaveLength(25);
    const byKingdom = (k: string) => allGenerals.filter((g) => g.kingdom === k).length;
    expect(byKingdom('wei')).toBe(7);
    expect(byKingdom('shu')).toBe(7);
    expect(byKingdom('wu')).toBe(8);
    expect(byKingdom('qun')).toBe(3);
  });

  it('has unique, ASCII, slug-shaped ids', () => {
    const ids = allGenerals.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
  });

  it('gives every general a legal max HP', () => {
    for (const g of allGenerals) {
      expect(g.maxHp).toBeGreaterThanOrEqual(3);
      expect(g.maxHp).toBeLessThanOrEqual(4);
    }
  });

  it('gives every general a gender (task 4.1a — 结姻/离间 target males only)', () => {
    for (const g of allGenerals) expect(['male', 'female']).toContain(g.gender);
    expect(allGenerals.filter((g) => g.gender === 'female')).toHaveLength(5);
  });

  it('gives every general 1–2 skills, all of which exist in skills.json', () => {
    const skillIds = new Set(allSkills.map((s) => s.id));
    for (const g of allGenerals) {
      expect(g.skillIds.length, `${g.id} has no skills`).toBeGreaterThanOrEqual(1);
      expect(g.skillIds.length, `${g.id} has more than 2 skills`).toBeLessThanOrEqual(2);
      for (const id of g.skillIds) {
        expect(skillIds.has(id), `${g.id} references unknown skill '${id}'`).toBe(true);
      }
    }
  });
});

describe('skills.json (task 4.1a — docs/skill-trigger-design.md §8)', () => {
  it('has 40 skills across the 25 standard generals', () => {
    expect(allSkills).toHaveLength(40);
    const generalIds = new Set(allGenerals.map((g) => g.id));
    for (const s of allSkills) expect(generalIds.has(s.generalId), `${s.id}`).toBe(true);
  });

  it('has unique, ASCII, slug-shaped ids', () => {
    const ids = allSkills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
  });

  it('is reachable from its own general (skills.json ⇄ generals.json agree both ways)', () => {
    for (const s of allSkills) {
      const general = allGenerals.find((g) => g.id === s.generalId)!;
      expect(general.skillIds, `${s.id} not listed on ${s.generalId}`).toContain(s.id);
    }
  });

  it('declares a valid kind for every skill (design §0: trigger · query · active)', () => {
    for (const s of allSkills) {
      expect(s.kind.length, `${s.id} has no kind`).toBeGreaterThanOrEqual(1);
      for (const k of s.kind) expect(['trigger', 'query', 'active']).toContain(k);
    }
  });

  it('marks exactly the three lord skills (护驾 · 激将 · 救援)', () => {
    const lord = allSkills.filter((s) => s.lordOnly).map((s) => s.id);
    expect(lord.sort()).toEqual(['hujia', 'jijiang', 'jiuyuan']);
  });

  it('only locks skills that never prompt (design §4: locked skills answer the query folds)', () => {
    const locked = allSkills.filter((s) => s.locked).map((s) => s.id);
    expect(locked.sort()).toEqual(
      ['kongcheng', 'mashu', 'jiuyuan', 'paoxiao', 'qianxun', 'qicai', 'wushuang', 'yingzi'].sort(),
    );
  });
});

describe('locales', () => {
  const enKeys = Object.keys(en as Record<string, string>);
  const zhKeys = Object.keys(zh as Record<string, string>);

  it('has identical key sets in zh and en', () => {
    expect([...enKeys].sort()).toEqual([...zhKeys].sort());
  });

  it('has no empty strings', () => {
    for (const [k, v] of Object.entries({ ...en, ...zh } as Record<string, string>)) {
      expect(v.trim(), `empty value for ${k}`).not.toBe('');
    }
  });

  it('keys every general and every distinct card name', () => {
    for (const g of allGenerals) expect(enKeys).toContain(`general.${g.id}`);
    const distinctCardNames = new Set(allCards.map((c) => c.enName));
    // one card.* key per distinct card name (copies share a key)
    const cardKeys = enKeys.filter((k) => k.startsWith('card.'));
    expect(cardKeys).toHaveLength(distinctCardNames.size);
  });

  it('keys every skill with both a name and a description (task 4.1a)', () => {
    for (const s of allSkills) {
      expect(enKeys, `${s.id} missing name key`).toContain(`skill.${s.id}.name`);
      expect(enKeys, `${s.id} missing desc key`).toContain(`skill.${s.id}.desc`);
    }
    // No orphan skill.* keys either — a renamed skill must not leave a stale string behind.
    const skillKeys = enKeys.filter((k) => k.startsWith('skill.'));
    expect(skillKeys).toHaveLength(allSkills.length * 2);
  });
});
