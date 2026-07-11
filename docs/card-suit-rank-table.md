# Locked Card Suit/Rank Table — Standard Edition (标准版)

Build breakdown item **1.1**. This locks the physical suit (♠♥♦♣) and rank (A–K) of every card in the 107-card Standard set, for `cards.json` generation (item 1.2).

## Method

1. Pulled the "标准版+EX+军争篇" combined deck table from 萌娘百科「三国杀/牌堆结构」 (renders via JS; raw HTML carries `color:red` = 军争篇/Battle-expansion additions, `color:blue` = other-product additions, uncolored = base/Standard-family cards). Filtered to uncolored entries only.
2. Cross-checked resulting per-card counts against **18183.com「三国杀标准版牌明细」**, which independently enumerates the 53/35/19 breakdown by name.
3. Cross-checked card names/types (not suit/rank) against **sanguoshaenglish.blogspot.com** (English walkthrough) for the bilingual key list.
4. Where the moegirl "combined" pool had one extra copy over the 18183 count (无懈可击: 4 candidates vs. target 3), dropped the surplus **(EX)-annotated** copy — those are extra copies moegirl includes to support the 8-player "军8" combined format, not the base Standard box.

Total locks at **107 cards** (53 basic + 35 trick + 19 equipment), matching `three-kingdoms-plan.md` §3's count-check.

## Two corrections to the plan doc found during reconciliation

- **诸葛连弩 (Zhuge Crossbow) has 2 copies, not 1.** The plan's weapon table (§3.3) doesn't list counts and was implicitly treated as 1-per-weapon; 18183 and moegirl both independently show 2. Equipment total only reaches 19 with this correction (10 weapons + 3 armour + 6 horses).
- **The third −1 Horse is 爪黄飞电 (Zhaohuang Feidian), not 骅骝 (Hualiu).** The plan's §3.3 horse row lists −1马 as 赤兔/的卢/骅骝, but moegirl's uncolored (Standard) entries show 赤兔, 的卢, and 爪黄飞电 as the three Standard −1马 cards; 骅骝 is colored **red** in the source (a 军争篇/Battle-expansion addition), not part of Standard. Fixed in `three-kingdoms-plan.md`.

---

## Grid (by rank × suit)

Cells list every card at that suit/rank. `杀`/`闪`/`桃` repeat because the physical Standard deck is built from two combined decks' worth of suited cards.

| Rank | ♥ | ♦ | ♣ | ♠ |
|---|---|---|---|---|
| A | 桃园结义, 万箭齐发 | 诸葛连弩, 决斗 | 诸葛连弩, 决斗 | 闪电, 决斗 |
| 2 | 闪, 闪 | 闪, 闪 | 杀, 八卦阵, 仁王盾 | 雌雄双股剑, 八卦阵, 寒冰剑 |
| 3 | 桃, 五谷丰登 | 闪, 顺手牵羊 | 杀, 过河拆桥 | 顺手牵羊, 过河拆桥 |
| 4 | 桃, 五谷丰登 | 闪, 顺手牵羊 | 杀, 过河拆桥 | 顺手牵羊, 过河拆桥 |
| 5 | 赤兔, 麒麟弓 | 闪, 贯石斧 | 的卢, 杀 | 绝影, 青龙偃月刀 |
| 6 | 桃, 乐不思蜀 | 杀, 闪 | 杀, 乐不思蜀 | 青釭剑, 乐不思蜀 |
| 7 | 桃, 无中生有 | 杀, 闪 | 杀, 南蛮入侵 | 杀, 南蛮入侵 |
| 8 | 桃, 无中生有 | 杀, 闪 | 杀, 杀 | 杀, 杀 |
| 9 | 桃, 无中生有 | 杀, 闪 | 杀, 杀 | 杀, 杀 |
| 10 | 杀, 杀 | 杀, 闪 | 杀, 杀 | 杀, 杀 |
| J | 杀, 无中生有 | 闪, 闪 | 杀, 杀 | 顺手牵羊, 无懈可击 |
| Q | 桃, 过河拆桥, 闪电 | 桃, 方天画戟 | 借刀杀人, 无懈可击 | 丈八蛇矛, 过河拆桥 |
| K | 闪, 爪黄飞电 | 杀, 紫骍 | 借刀杀人, 无懈可击 | 南蛮入侵, 大宛 |

*(闪电's second copy sits at Q♥, and 无懈可击's third copy sits at K♣ — both were moegirl "(EX)" print-variant cells, kept because dropping them would undercount below the 18183 target.)*

---

## By card (for `cards.json`)

### 3.1 Basic (53)

| 中文 | EN | Count | Positions |
|---|---|---|---|
| 杀 | Strike | 30 | 2♣ 3♣ 4♣ 5♣ 6♦ 6♣ 7♦ 7♣ 7♠ 8♦ 8♣ 8♣ 8♠ 8♠ 9♦ 9♣ 9♣ 9♠ 9♠ 10♥ 10♥ 10♦ 10♣ 10♣ 10♠ 10♠ J♥ J♣ J♣ K♦ |
| 闪 | Dodge | 15 | 2♥ 2♥ 2♦ 2♦ 3♦ 4♦ 5♦ 6♦ 7♦ 8♦ 9♦ 10♦ J♦ J♦ K♥ |
| 桃 | Peach | 8 | 3♥ 4♥ 6♥ 7♥ 8♥ 9♥ Q♥ Q♦ |

### 3.2 Trick (35)

| 中文 | EN | Count | Positions |
|---|---|---|---|
| 过河拆桥 | Dismantle | 6 | 3♣ 3♠ 4♣ 4♠ Q♥ Q♠ |
| 顺手牵羊 | Steal | 5 | 3♠ 3♦ 4♠ 4♦ J♠ |
| 无中生有 | Draw Two | 4 | 7♥ 8♥ 9♥ J♥ |
| 决斗 | Duel | 3 | A♦ A♣ A♠ |
| 南蛮入侵 | Barbarian Invasion | 3 | 7♣ 7♠ K♠ |
| 乐不思蜀 | Indulgence | 3 | 6♥ 6♣ 6♠ |
| 无懈可击 | Nullification | 3 | J♠ Q♣ K♣ |
| 五谷丰登 | Harvest | 2 | 3♥ 4♥ |
| 借刀杀人 | Duress | 2 | Q♣ K♣ |
| 闪电 | Lightning | 2 | A♠ Q♥ |
| 万箭齐发 | Raining Arrows | 1 | A♥ |
| 桃园结义 | Peach Garden | 1 | A♥ |

### 3.3 Equipment (19)

**Weapons**

| 中文 | EN | Count | Positions |
|---|---|---|---|
| 诸葛连弩 | Zhuge Crossbow | 2 | A♦ A♣ |
| 雌雄双股剑 | Gender Swords | 1 | 2♠ |
| 青釭剑 | Blue-Steel Sword | 1 | 6♠ |
| 寒冰剑 | Frost Blade | 1 | 2♠(EX-print) |
| 贯石斧 | Rock-Cleaving Axe | 1 | 5♦ |
| 青龙偃月刀 | Green Dragon Blade | 1 | 5♠ |
| 丈八蛇矛 | Serpent Spear | 1 | Q♠ |
| 方天画戟 | Heaven-Scorcher Halberd | 1 | Q♦ |
| 麒麟弓 | Unicorn Bow | 1 | 5♥ |

**Armour**

| 中文 | EN | Count | Positions |
|---|---|---|---|
| 八卦阵 | Eight Trigrams | 2 | 2♣ 2♠ |
| 仁王盾 | Renwang Shield | 1 | 2♣(EX-print) |

**Horses**

| 中文 | EN | Type | Positions |
|---|---|---|---|
| 赤兔 | Red Hare | −1 | 5♥ |
| 的卢 | Dilu | −1 | 5♣ |
| 爪黄飞电 | Zhaohuang Feidian | −1 | K♥ |
| 绝影 | Shadow | +1 | 5♠ |
| 紫骍 | Zixing | +1 | K♦ |
| 大宛 | Dawan | +1 | K♠ |

---

## Sources

- [三国杀/牌堆结构 — 萌娘百科](https://zh.moegirl.org.cn/%E4%B8%89%E5%9B%BD%E6%9D%80/%E7%89%8C%E5%A0%86%E7%BB%93%E6%9E%84) — primary, suit/rank grid (color-coded by edition)
- [三国杀标准版牌明细 — 18183](https://www.18183.com/gonglue/202207/4044017.html) — cross-check, independent per-card counts
- [San Guo Sha English Walkthrough — All Cards](http://sanguoshaenglish.blogspot.com/p/all-cards.html) — cross-check, card names/types + EN translations
- `docs/three-kingdoms-plan.md` §3 — target counts (53+35+19=107) validated against
