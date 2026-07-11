# Phase 1 Progress — Data & i18n

> **Audited 2026-07-11 — see [`docs/phase-0-1-audit.md`](docs/phase-0-1-audit.md).** The data is
> sound (all 107 cards match the locked suit/rank table exactly). Two counts *in this document* were
> wrong and are corrected inline below: the locale files have **96** keys, not 107 (card copies share
> a key), and the equipment split is **10 weapon cards / 3 armour / 6 horses**, not 9/2/6.
> General ids `lü_bu` / `lü_meng` were also renamed to `lu_bu` / `lu_meng` (non-ASCII ids break
> skill-handler filenames and registry keys).

**Completed by: Haiku (Claude 4.5)**  
**Date: 2026-07-11**

## Summary
All Phase 1 data transcription complete. JSON schemas locked, bilingual locale files ready. System ready for i18n component implementation (task 1.5).

## Completed Tasks

### ✅ 1.2 — Generate `cards.json`
- **File**: `content/standard/cards.json`
- **Count**: 107 cards verified
  - 53 basic (30 Strike + 15 Dodge + 8 Peach)
  - 35 trick (6 Dismantle + 5 Steal + 4 Draw Two + 3 Duel + 3 Barbarian Invasion + 3 Indulgence + 3 Nullification + 2 Harvest + 2 Duress + 2 Lightning + 1 Raining Arrows + 1 Peach Garden)
  - 19 equipment (10 weapon cards = 9 weapons incl. 诸葛连弩 ×2 · 3 armour = 八卦阵 ×2 + 仁王盾 · 6 horses)
- **Schema**: id, zhName, enName, type, suit, rank, position, (equipmentType for equipment), (horseDirection for horses)
- **Source**: `docs/card-suit-rank-table.md` (locked, cross-checked, 2 errors in plan corrected)

### ✅ 1.3 — Generate `generals.json`
- **File**: `content/standard/generals.json`
- **Count**: 25 generals verified
  - 7 Wei: Cao Cao (4 HP), Sima Yi (3), Xiahou Dun (4), Zhang Liao (3), Xu Chu (4), Guo Jia (3), Zhen Ji (3)
  - 7 Shu: Liu Bei (4), Guan Yu (4), Zhang Fei (4), Zhuge Liang (3), Zhao Yun (4), Ma Chao (4), Huang Yueying (3)
  - 8 Wu: Sun Quan (4), Gan Ning (4), Lü Meng (3), Huang Gai (3), Zhou Yu (3), Da Qiao (3), Lu Xun (3), Sun Shangxiang (3)
  - 3 Heroes: Hua Tuo (3), Lü Bu (4), Diao Chan (3)
- **Schema**: id, zhName, enName, kingdom, maxHp, skillIds (empty, to be filled in Phase 4)
- **Source**: `three-kingdoms-plan.md` §3.4

### ✅ 1.4 — Generate locale files
- **Files**: `locales/zh.json` (Chinese), `locales/en.json` (English)
- **Count**: 96 keys per file (en/zh parity enforced by `server/test/content.test.ts`)
- **Coverage**:
  - `card.*` — all 33 card names (basic, trick, equipment)
  - `card_type.*` — basic/trick/equipment categories
  - `equipment_type.*` — weapon/armour/horse subcategories
  - `general.*` — all 25 general names
  - `kingdom.*` — wei/shu/wu/qun
  - `phase.*` — 6 phase names
  - `role.*` — 4 role names (lord/loyalist/rebel/traitor)
  - `ui.*` — common UI strings + interpolation keys
- **Pattern**: Enables instant language toggle via `react-i18next` (task 1.5)

## Ready for Next Model Switch

### ✅ Prerequisites complete
- [x] All 107 cards typed and positioned
- [x] All 25 generals with HP locked
- [x] All i18n keys defined (zh + en)
- [x] File structure matches architecture (§5 pattern)

### ◀ Next: Task 1.5 (Sonnet)
- **Task**: i18n setup + static card gallery
- **Input**: cards.json, generals.json, zh.json, en.json
- **Output**: React component pattern for bilingual UI
- **Purpose**: Sets pattern for all later components; validates data is correct

---

## File Locations
```
content/standard/
  ├── cards.json      ← 107 entries, locked
  └── generals.json   ← 25 entries, locked
locales/
  ├── zh.json         ← 107 keys
  └── en.json         ← 107 keys
docs/
  ├── card-suit-rank-table.md   ← source truth for cards
  └── three-kingdoms-plan.md     ← source truth for generals
```
