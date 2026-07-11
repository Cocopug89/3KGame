# 三国杀 · Three Kingdoms Kill — Build Plan

*A playable, bilingual (中文 / English) browser version for our friends circle. Online multiplayer, Standard edition first, built to grow into expansions later.*

---

## 1. Decisions locked in

| Question | Decision |
|---|---|
| How friends play | **Online multiplayer** — each person on their own device, real-time over the internet |
| Content scope (v1) | **Standard edition (标准版)** only — 25 generals + the standard card set. Architecture must let expansions (风/火/林/山, 军争) be added later without a rewrite |
| Hosting | Frontend on **Netlify** (free). Real-time game logic on a small **authoritative game server** (free tier) — see §6 |
| Interface | **Live ZH ⇄ EN toggle** everywhere: cards, generals, skills, roles, prompts |

A hidden-information card game **cannot** be trusted to the browser — if the client knew the whole deck and everyone's hand, anyone could cheat by opening dev tools. So the real rules run on a **server** that only tells each player what they're allowed to see. This is the single most important architectural fact and it shapes everything below.

---

## 2. The ruleset (Standard edition)

### Objective (by role)
Every player secretly draws a role. Win conditions:

- **主公 Lord / Monarch** — survive; win when all Rebels and the Traitor are dead.
- **忠臣 Loyalist** — protect the Lord; wins with the Lord.
- **反贼 Rebel** — kill the Lord.
- **内奸 Traitor / Spy** — be the *last person standing* (kill everyone, Lord last).

Role counts by player number (Standard):

| Players | 主公 | 忠臣 | 反贼 | 内奸 |
|---|---|---|---|---|
| 4 | 1 | 1 | 1 | 1 |
| 5 | 1 | 1 | 2 | 1 |
| 6 | 1 | 1 | 3 | 1 |
| 7 | 1 | 2 | 3 | 1 |
| 8 | 1 | 2 | 4 | 1 |

The Lord's role is public; everyone else's is hidden until death.

### Setup
1. Deal roles; Lord reveals.
2. Each player is dealt candidate generals, picks one (Lord picks first / from a wider pool). General sets **health (体力)** — usually 3–4; the Lord gets **+1 max HP**.
3. Everyone draws an opening hand of **4 cards**.

### Turn structure (回合) — six phases
1. **准备阶段 Preparation Phase** — "start of turn" skills trigger.
2. **判定阶段 Judgement Phase** — resolve delayed trick cards in front of the player (Lightning, Indulgence, Rations) via a **judgement (判定)** — flip the top card and check its suit/rank.
3. **摸牌阶段 Draw Phase** — draw **2 cards**.
4. **出牌阶段 Action / Play Phase** — play any number of cards, subject to the rules (notably: **only one 杀 Strike per turn** unless a card/skill says otherwise).
5. **弃牌阶段 Discard Phase** — discard down to your **hand limit = current HP**.
6. **结束阶段 End Phase** — "end of turn" skills trigger.

### Core mechanics the engine must model
- **Distance / Range (距离)** — attack range for 杀 Strike. Base distance between players = seats apart; **−1 Horse** makes *you* closer to others (offense), **+1 Horse** makes others farther from *you* (defense); weapons set attack range (e.g. range 1–3).
- **Dying & rescue (濒死)** — at 0 HP a player is dying; anyone may play **桃 Peach** (or the dying player 酒 Wine — Battle-pack, skip in v1) to restore to 1 HP. If nobody saves them, they die.
- **Judgement (判定)** — a flipped card whose suit/rank determines an outcome (e.g. Lightning triggers on ♠2–9).
- **Nullification chain (无懈可击)** — trick cards can be countered, and the counter can itself be countered, recursively.
- **Damage types** — normal, **fire (火)**, **thunder (雷)** — matters for a few interactions (armour, chained players). Standard set is mostly normal damage.
- **Equipment zone** — each player has 4 slots: Weapon, Armour, +1 Horse, −1 Horse.

> **Implementation note:** exact **suit (♠♥♣♦) and rank (A–K) of every physical card** varies slightly between print runs. **Locked** — see [`docs/card-suit-rank-table.md`](card-suit-rank-table.md) for the per-card suit/rank table (sourced from 萌娘百科, cross-checked against 18183 and the English walkthrough), so judgements and 拼点 (point-duels) behave correctly. The counts below are the canonical Standard breakdown.

---

## 3. The card sets (Standard edition ≈ 108 cards)

### 3.1 Basic cards 基本牌 (53)

| 中文 | English | Count | Effect (summary) |
|---|---|---|---|
| 杀 | Strike | 30 | Deal 1 damage to a target in range; target may play 闪 to avoid. Max one per turn. |
| 闪 | Dodge | 15 | Cancels a 杀 targeting you. |
| 桃 | Peach | 8 | Heal 1 HP (only when hurt); can save a dying player at any time. |

*(火杀/雷杀 fire & thunder Strikes and 酒 Wine belong to the Battle expansion — deferred.)*

### 3.2 Trick / Tool cards 锦囊牌 (35)

| 中文 | English | Count | Type |
|---|---|---|---|
| 过河拆桥 | Dismantle | 6 | Instant — discard a card from a target |
| 顺手牵羊 | Steal | 5 | Instant — take a card from a target within distance 1 |
| 无中生有 | Draw Two (Something from Nothing) | 4 | Instant — draw 2 cards |
| 决斗 | Duel | 3 | Instant — target and you alternate playing 杀; who runs out takes damage |
| 南蛮入侵 | Barbarian Invasion | 3 | AoE — every other player must play 杀 or take 1 damage |
| 乐不思蜀 | Indulgence (Acedia) | 3 | **Delayed** — judgement; if not ♥, skip your Action phase |
| 无懈可击 | Nullification (Negate) | 3 | Instant — cancel a trick card's effect (chainable) |
| 五谷丰登 | Harvest | 2 | AoE — reveal N cards, each player picks one |
| 借刀杀人 | Duress (Borrowed Knife) | 2 | Instant — force an armed target to 杀 someone, or surrender their weapon |
| 闪电 | Lightning | 2 | **Delayed** — judgement each turn; on ♠2–9 deal 3 thunder damage, else passes on |
| 万箭齐发 | Raining Arrows (Barrage) | 1 | AoE — every other player must play 闪 or take 1 damage |
| 桃园结义 | Peach Garden (Brotherhood) | 1 | AoE — every player heals 1 HP |

### 3.3 Equipment cards 装备牌 (19)

**Weapons 武器 (attack range in brackets)**

| 中文 | English | Range | Effect |
|---|---|---|---|
| 诸葛连弩 (×2 copies) | Zhuge Crossbow (×2 copies) | 1 | Unlimited 杀 per turn |
| 雌雄双股剑 | Gender Swords | 2 | vs opposite-gender target: they discard a card or you draw |
| 青釭剑 | Blue-Steel Sword (Qinggang) | 2 | Your 杀 ignores the target's armour |
| 寒冰剑 | Frost Blade | 2 | Instead of damage, strip 2 of the target's cards |
| 贯石斧 | Rock-Cleaving Axe | 3 | If 杀 dodged, discard 2 cards to force the hit |
| 青龙偃月刀 | Green Dragon Blade | 3 | If 杀 dodged, immediately 杀 again |
| 丈八蛇矛 | Serpent Spear | 3 | Use any 2 hand cards as a 杀 |
| 方天画戟 | Heaven-Scorcher Halberd | 4 | Your last hand card as 杀 can target up to 3 |
| 麒麟弓 | Unicorn Bow | 5 | On damage, may discard the target's horse |

**Armour 防具**

| 中文 | English | Count | Effect |
|---|---|---|---|
| 八卦阵 | Eight Trigrams | 2 | When needing a 闪, judge — ♥/♦ counts as a 闪 |
| 仁王盾 | Renwang Shield | 1 | Immune to black (♠/♣) 杀 |

**Horses 马**

| 中文 | English | Count | Effect |
|---|---|---|---|
| +1 马 (绝影 / 大宛 / 紫骍) | +1 Horse (Shadow / Dawan / Zixing) | 3 | Others are 1 farther from you |
| −1 马 (赤兔 / 的卢 / 爪黄飞电) | −1 Horse (Red Hare / Dilu / Zhaohuang Feidian) | 3 | You are 1 closer to others |

*Count check: 53 + 35 + 19 = **107**. Exact suit/rank locked per-card in [`docs/card-suit-rank-table.md`](card-suit-rank-table.md).*

### 3.4 Generals 武将 (25)

| Kingdom | Generals (中文 · English) |
|---|---|
| **魏 Wei (7)** | 曹操 Cao Cao · 司马懿 Sima Yi · 夏侯惇 Xiahou Dun · 张辽 Zhang Liao · 许褚 Xu Chu · 郭嘉 Guo Jia · 甄姬 Zhen Ji |
| **蜀 Shu (7)** | 刘备 Liu Bei · 关羽 Guan Yu · 张飞 Zhang Fei · 诸葛亮 Zhuge Liang · 赵云 Zhao Yun · 马超 Ma Chao · 黄月英 Huang Yueying |
| **吴 Wu (8)** | 孙权 Sun Quan · 甘宁 Gan Ning · 吕蒙 Lü Meng · 黄盖 Huang Gai · 周瑜 Zhou Yu · 大乔 Da Qiao · 陆逊 Lu Xun · 孙尚香 Sun Shangxiang |
| **群 Qun / Heroes (3)** | 华佗 Hua Tuo · 吕布 Lü Bu · 貂蝉 Diao Chan |

Each general = **max HP + 1–2 skills**. Skills are the hardest part of the engine: they hook into events (on-damage, on-dodge, start-of-turn, etc.). The plan treats each skill as an isolated, testable handler so we can ship generals incrementally.

---

## 4. Bilingual layer (中文 ⇄ English)

Everything the player sees is a **key**, never hard-coded text. One dictionary per language:

```
locales/
  zh.json   → { "card.sha": "杀", "skill.jianxiong": "奸雄", "phase.draw": "摸牌阶段", ... }
  en.json   → { "card.sha": "Strike", "skill.jianxiong": "Villainous Hero", "phase.draw": "Draw Phase", ... }
```

- A single toggle in the top bar flips the whole UI instantly (no reload); the choice is remembered per browser.
- Card and general **data** (suit, rank, HP, effect logic) is language-independent JSON; only the *display strings* come from the locale files.
- This means expansions add new keys to both files — the toggle keeps working for free.

The §3 tables above are effectively the seed content for `zh.json` / `en.json`.

---

## 5. Architecture — built for expansions from day one

```
┌─────────────────────────────┐        websocket        ┌──────────────────────────────┐
│  Browser client (Netlify)   │  <───────────────────>  │  Authoritative game server    │
│  • React + Vite + TS        │                         │  • Rules engine (the truth)   │
│  • i18n toggle (zh/en)      │   only sends each        │  • Deck, turn loop, phases    │
│  • Renders MY hand + table  │   player what they       │  • Hidden info per player      │
│  • Sends my chosen actions  │   may legally see        │  • Lobby / rooms / roles       │
└─────────────────────────────┘                         └──────────────────────────────┘
```

**Content is data, not code.** The engine is generic; the game is defined by JSON + small handlers:

```
/content
  /standard
    cards.json        <- every card: id, type, suit, rank, effectKey, i18nKey
    generals.json     <- id, kingdom, maxHp, skillIds, i18nKey
    skills/*.ts       <- one handler per skill, registered in a registry
  /expansions
    /wind  /fire  /forest  /mountain  /battle   <- added later, same shape
```

Adding an expansion later = drop in another folder + register its handlers. No engine rewrite. This directly satisfies your "allow expansions to be programmed in later" requirement.

**Effect & skill registry pattern:** cards reference an `effectKey` (e.g. `"strike"`, `"dismantle"`); the engine looks the key up in a registry of handler functions. Same for skills. New content = new entries in the registry.

---

## 6. Tech stack recommendation

| Layer | Recommendation | Why |
|---|---|---|
| **Game framework** | **boardgame.io** (Node + TS) | Purpose-built for turn-based card games: authoritative server, turn order, phases, **secret state per player (`playerView`)**, lobby, and React bindings — removes most multiplayer plumbing and handles the "don't trust the client" problem. |
| **Client** | **React + Vite + TypeScript** | Fast, component-friendly for card/table UI; deploys to Netlify as a static build. |
| **i18n** | `react-i18next` or a tiny custom `t()` | Instant language toggle from the locale JSON. |
| **Frontend host** | **Netlify** (free) | As you chose — public URL friends open in a browser. |
| **Server host** | **Render / Railway / Fly.io** free tier | Netlify can't hold the persistent websocket a live game needs; the boardgame.io server runs here. Client (Netlify) → server (Render) over websockets. |
| **Alternative** | **Colyseus** (lower-level room control) or **Supabase Realtime / PartyKit** | Fallbacks if boardgame.io's model chafes. |

*Trade-off to flag: a free-tier server may "cold start" (a few seconds to wake) if idle — fine for a friends group, not for 24/7 play.*

---

## 7. Build phases & milestones

**Phase 0 — Scaffold (½–1 day).** Repo, Vite+React+TS client, boardgame.io server, Netlify + Render deploy of a "hello, synced state" page. Proves the pipe end-to-end before any rules.

**Phase 1 — Data & i18n (1–2 days).** Turn §3 into `cards.json` + `generals.json` + `zh.json`/`en.json` (with the exact suit/rank table locked from source). Language toggle working on a static card gallery. *Mostly done in this document.*

**Phase 2 — Core engine (3–5 days).** Deck build/shuffle/discard, 6-phase turn loop, draw, hand limit, **杀/闪/桃**, distance & range, dying/rescue. Playable end-to-end with placeholder no-skill generals.

**Phase 3 — Tricks & equipment (3–5 days).** All 12 trick types incl. the **nullification chain** and **judgement** system; all 4 equipment slots incl. horses & weapon ranges.

**Phase 4 — Generals & skills (ongoing, ship in batches).** Skill event system, then the 25 generals a few at a time (start simple: Guan Yu, Zhang Fei, Zhen Ji; save complex ones like Guo Jia / Sima Yi for last). Each skill gets a unit test.

**Phase 5 — Multiplayer & lobby (2–4 days).** Rooms, join-by-code, role dealing, general selection, hidden-role reveal on death, reconnection. (boardgame.io provides much of this.)

**Phase 6 — Bilingual UI polish (2–3 days).** Full table layout, animations, prompts, log — all keyed through i18n; verify the toggle covers 100% of on-screen text.

**Phase 7 — Deploy & playtest (ongoing).** Share the Netlify URL, run games, fix edge-cases. Later: layer in expansions using the §5 folder pattern.

**Rough total for a solid Standard-edition v1:** ~3–5 focused weeks; a *minimum playable* core (basic cards + a handful of generals, multiplayer) is reachable in ~1–2 weeks.

---

## 8. Key risks & mitigations

- **Rules edge-cases (nullification chains, simultaneous triggers, skill timing)** — the deepest complexity. Mitigation: event-driven engine + a unit test per card and per skill; build judgement/nullification *before* the generals that lean on them.
- **Cheating in a hidden-info game** — solved by server-authoritative state + `playerView` (client never receives other hands / the deck order).
- **Card data accuracy** — lock the exact suit/rank table from a definitive source before coding the deck.
- **Free-tier server cold starts** — acceptable for casual play; revisit if annoying.
- **Scope creep into expansions** — the data-driven `/content` structure lets us ship Standard cleanly and add packs later without touching the engine.

---

## 9. Immediate next steps

1. Confirm the stack (boardgame.io + React/Vite on Netlify + Render) — or say if you'd prefer a simpler single-device prototype first.
2. I scaffold the repo (Phase 0) and generate `cards.json` / `generals.json` / `zh.json` / `en.json` straight from §3.
3. Lock the definitive card-by-card suit/rank table.
4. Build the core engine (Phase 2) to a playable state.

---

### Sources
- [三国杀标准版牌明细 (18183)](https://www.18183.com/gonglue/202207/4044017.html)
- [三国杀标准版 — 维基百科](https://zh.wikipedia.org/zh-hans/%E4%B8%89%E5%9C%8B%E6%AE%BA%E6%A8%99%E6%BA%96%E7%89%88)
- [三国杀/牌堆结构 — 萌娘百科](https://zh.moegirl.org.cn/%E4%B8%89%E5%9B%BD%E6%9D%80/%E7%89%8C%E5%A0%86%E7%BB%93%E6%9E%84)
- [San Guo Sha English Walkthrough — All Cards](http://sanguoshaenglish.blogspot.com/p/all-cards.html)
- [San Guo Sha English Walkthrough — Game Rules](http://sanguoshaenglish.blogspot.com/2010/07/game-rules-part-1-game-set-up.html)
