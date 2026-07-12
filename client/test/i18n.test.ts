// Task 6.4 — the i18n coverage sweep.
//
// The plan's acceptance test for Phase 6 is "verify the toggle covers 100% of
// on-screen text", and the project rule is "every user-facing string is an i18n
// key". Both were, until now, enforced by a hand-maintained LIST of keys
// (viewModel.test.ts) — which checks that the keys someone remembered to write
// down exist, and says nothing about the string a component hardcoded last week.
//
// So this file audits rather than lists. Three sweeps, each of which fails on a
// class of mistake rather than on a specific known instance:
//
//   1. STATIC  — every `t('…')` key in the source exists in BOTH locales, and
//                every key the prompt layer can *derive* at runtime does too.
//   2. DYNAMIC — render every screen in both languages and diff the visible
//                text. Anything that renders identically in Chinese and English
//                is either language-neutral (a number, a suit pip) or it is a
//                hardcoded string, and the allowlist is short enough to read.
//   3. SOURCE  — the traps that don't show up in a render: a raw CJK literal in
//                a component, and `count` as an interpolation name (which flips
//                i18next into plural resolution and quietly breaks key parity).
//
// A note on what is NOT swept: the dev harnesses (`?table`, `?gallery`) render
// fixture ids like '4p · 无懈可击 demand'. Those are developer-facing labels, not
// game text, and they are excluded by path — deliberately, and in one place.

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { createInstance, type i18n as I18n } from 'i18next';
import en from '../../locales/en.json';
import zh from '../../locales/zh.json';
import { GameTable } from '../src/components/table/GameTable';
import { GeneralSelect } from '../src/lobby/GeneralSelect';
import { FIXTURES } from '../src/game/fixtures';
import { recordingActions } from '../src/game/actions';
import { promptFor } from '../src/game/prompts';
import { CARD_BLOCK_I18N_KEY } from '../src/game/prompts';
import { PHASE_I18N_KEY } from '../src/game/viewModel';
import { LOG_KEYS } from '../src/game/log';
import type { SelectionView, TableState } from '../src/game/viewTypes';

const EN = en as Record<string, string>;
const ZH = zh as Record<string, string>;

// ── the source tree ──────────────────────────────────────────────────────
const SRC = join(__dirname, '..', 'src');

/** Dev-only surfaces: their strings are developer labels, not game text. */
const HARNESS = ['TablePage.tsx', 'GalleryPage.tsx', 'fixtures.ts', 'scenario.ts', 'App.tsx'];

/** The one shipped component that is *supposed* to contain a raw Chinese string:
 * the language switcher labels each language in its own script ("中文" / "EN"),
 * because a Chinese speaker looking for Chinese should not have to first find
 * the English word for it. Exempt from the CJK sweep only — it is still swept
 * for everything else. */
const CJK_EXEMPT = ['components/LanguageToggle.tsx'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry)) return [];
    if (HARNESS.includes(entry)) return [];
    return [path];
  });
}

/** Comments are full of Chinese on purpose (every card is named in them), so
 * every source sweep below runs on the code with comments stripped. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FILES = sourceFiles(SRC).map((path) => ({
  path: path.slice(SRC.length + 1),
  code: stripComments(readFileSync(path, 'utf8')),
}));

describe('i18n sweep · every key the code asks for exists', () => {
  it('finds the source files it is meant to be sweeping', () => {
    // A regex sweep that silently matches nothing is a passing test that checks
    // nothing — pin the shape of the thing being swept.
    expect(FILES.length).toBeGreaterThan(10);
    expect(FILES.map((f) => f.path)).toContain(join('components', 'table', 'PromptPanel.tsx'));
  });

  it("resolves every literal t('…') key in both locales", () => {
    const missing: string[] = [];
    for (const { path, code } of FILES) {
      for (const [, key] of code.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) {
        if (!(key in EN)) missing.push(`${path}: en is missing "${key}"`);
        if (!(key in ZH)) missing.push(`${path}: zh is missing "${key}"`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('resolves every key the prompt layer derives at runtime', () => {
    // titleKey / primaryKey / secondaryKey are chosen by promptFor(), not written
    // at the call site, so no source regex can see them. Drive it over every
    // request kind the engine can raise instead — this is the sweep that would
    // have caught 3.2's demandCard arriving with no strings at all.
    const base = FIXTURES[0].state;
    // Every stage the engine can block on (4.1b deleted respondDodge/respondPeach
    // into demandCard; 3.3 added chooseCard; 4.3/4.4 added the last seven).
    // orderTriggers is excluded because no Standard general can reach it — see
    // interaction.test.ts.
    const kinds = [
      'act',
      'discard',
      'demandCard',
      'confirmSkill',
      'chooseCard',
      'chooseOption',
      'choosePlayer',
      'declareSuit',
      'guanxing',
      'guicaiRetrial',
      'yijiDistribute',
      'liuliRedirect',
    ];
    const missing: string[] = [];

    for (const kind of kinds) {
      const state: TableState = {
        ...base,
        pending: {
          kind,
          playerId: '0',
          count: 1,
          demandKind: 'nullification',
          target: '1',
          choices: [],
          triggerId: 'jianxiong',
          labelKey: 'skill.jianxiong.name',
        },
      };
      const prompt = promptFor(state, '0');
      expect(prompt, `${kind} has no prompt`).not.toBeNull();

      for (const key of [prompt!.titleKey, prompt!.primaryKey, prompt!.secondaryKey]) {
        if (key == null) continue;
        if (!(key in EN)) missing.push(`${kind}: en is missing "${key}"`);
        if (!(key in ZH)) missing.push(`${kind}: zh is missing "${key}"`);
      }
      // Every demand kind the engine can raise picks its own title (4.1b's
      // DEMAND_TITLE_KEYS) — a kind with no entry falls back to prompt.demand,
      // and both the entry and the fallback must exist.
      if (kind === 'demandCard') {
        for (const demandKind of ['dodge', 'peach', 'strike', 'nullification']) {
          const p = promptFor({ ...state, pending: { ...state.pending, demandKind } }, '0')!;
          for (const key of [p.titleKey, p.secondaryKey]) {
            if (key == null) continue;
            if (!(key in EN)) missing.push(`demand ${demandKind}: en is missing "${key}"`);
            if (!(key in ZH)) missing.push(`demand ${demandKind}: zh is missing "${key}"`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('resolves every key held in a lookup table (blocks, phases, the log vocabulary)', () => {
    const derived = [
      ...Object.values(CARD_BLOCK_I18N_KEY),
      ...Object.values(PHASE_I18N_KEY),
      ...LOG_KEYS,
    ];
    for (const key of derived) {
      expect(EN, `en is missing ${key}`).toHaveProperty([key]);
      expect(ZH, `zh is missing ${key}`).toHaveProperty([key]);
    }
  });

  it('has a locale entry for every reason the ENGINE can give (reasonKey)', () => {
    // The engine mints these itself and ships them on the request. A key with
    // nothing behind it is a question the player is asked in raw-key form; the
    // renderer guards with i18n.exists(), and this is the list that guard should
    // never actually need. The cards implemented today (3.3) are the ones that
    // can raise one.
    for (const key of [
      'choose.dismantle',
      'choose.steal',
      // 3.4: the delayed tricks (乐不思蜀/闪电) landed, so their judgement
      // reasonKeys now have real strings — see docs/handoff/3.4-complex-tricks.md.
      'judge.indulgence',
      'judge.lightning',
    ]) {
      expect(EN, `en is missing ${key}`).toHaveProperty([key]);
      expect(ZH, `zh is missing ${key}`).toHaveProperty([key]);
    }
  });
});

// ── sweep 2: does the toggle actually cover the screen? ───────────────────
let i18n: I18n;

beforeAll(async () => {
  i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: en }, zh: { translation: zh } },
    interpolation: { escapeValue: false },
  });
});

/** Visible text, as the player sees it: tag content, whitespace-collapsed. */
function visibleText(html: string): string[] {
  return [...html.matchAll(/>([^<>]+)</g)]
    .map(([, text]) => text.replace(/\s+/g, ' ').trim())
    .filter((text) => text.length > 0);
}

async function renderIn(language: string, element: Parameters<typeof createElement>[0], props: object) {
  await i18n.changeLanguage(language);
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n }, createElement(element as never, props as never)),
  );
}

/** Text that is the same in both languages because it carries no language:
 *
 *   • numbers, HP pips, separators, the "no cards" dash
 *   • a card's corner — "A♦", "10♠". Rank and suit are printed on the physical
 *     card in exactly this form in both editions; they are notation, not words.
 *   • the app's own title, which is bilingual on purpose.
 *
 * Everything else that renders identically in Chinese and English is a string a
 * component typed out instead of keying, and this list is deliberately short
 * enough that adding to it is a decision rather than a reflex. */
const LANGUAGE_NEUTRAL =
  /^[\s\d·—–\-+−…:,.()/|♠♥♣♦%@#*]*$|^(?:10|[2-9JQKA])[♠♥♣♦]$|^(?:三国杀 · Three Kingdoms Kill|\?)$/;

const SELECTION: SelectionView = {
  lord: '0',
  awaiting: ['1', '2'],
  candidates: ['cao_cao', 'guan_yu', 'zhou_yu'],
  lockedIn: [],
  lordGeneralId: null,
  myPick: null,
};

describe('i18n sweep · the toggle covers 100% of on-screen text', () => {
  const screens: { name: string; render: (lang: string) => Promise<string> }[] = [
    ...FIXTURES.map((f) => ({
      name: `table · ${f.id}`,
      render: (lang: string) =>
        renderIn(lang, GameTable, {
          state: f.state,
          viewerId: f.viewerId,
          actions: recordingActions(() => {}),
        }),
    })),
    {
      name: 'general selection · picking',
      render: (lang: string) =>
        renderIn(lang, GeneralSelect, { selection: SELECTION, viewerId: '1', onPick: () => {} }),
    },
    {
      // The screen EVERY non-lord player sees at the start of EVERY game: the
      // Lord is picking, alone and in the open, and you are watching. It went
      // unrendered by any test until 6.4, and it was showing the raw key
      // `lobby.waiting` — a key that exists in neither locale file.
      name: 'general selection · watching the lord pick',
      render: (lang: string) =>
        renderIn(lang, GeneralSelect, {
          selection: { ...SELECTION, awaiting: ['0'], candidates: [], myPick: null },
          viewerId: '1',
          onPick: () => {},
        }),
    },
    {
      name: 'general selection · picked, waiting for the rest',
      render: (lang: string) =>
        renderIn(lang, GeneralSelect, {
          selection: { ...SELECTION, awaiting: ['2'], candidates: [], myPick: 'guan_yu' },
          viewerId: '1',
          onPick: () => {},
        }),
    },
  ];

  it('renders no raw i18n key and no unresolved placeholder, in either language', async () => {
    for (const screen of screens) {
      for (const lang of ['en', 'zh']) {
        const html = await screen.render(lang);
        expect(html, `${screen.name} (${lang})`).not.toMatch(
          /\b(ui|prompt|log|role|phase|kingdom|card|card_type|equipment_type|choose|nullify|judge|select|lobby|skill)\.[a-z_]+/,
        );
        expect(html, `${screen.name} (${lang})`).not.toContain('{{');
      }
    }
  });

  it('translates every visible string — anything identical in zh and en is language-neutral', async () => {
    const untranslated = new Set<string>();

    for (const screen of screens) {
      const enText = visibleText(await screen.render('en'));
      const zhText = visibleText(await screen.render('zh'));

      // Same DOM shape in both languages (6.1's invariant), so the two text
      // streams line up index for index. A slot that is byte-identical in both
      // and isn't language-neutral was never translated — i.e. it is a string
      // some component typed out instead of keying.
      expect(zhText.length, `${screen.name}: layout differs between languages`).toBe(enText.length);
      for (let i = 0; i < enText.length; i++) {
        if (enText[i] === zhText[i] && !LANGUAGE_NEUTRAL.test(enText[i])) {
          untranslated.add(`${screen.name}: "${enText[i]}"`);
        }
      }
    }

    expect([...untranslated]).toEqual([]);
  });
});

// ── sweep 3: the traps a render can't show you ────────────────────────────
describe('i18n sweep · source-level traps', () => {
  it('has no hardcoded CJK text in any shipped component', async () => {
    // Comments are stripped (they name every card in Chinese, on purpose), so a
    // hit here is a string literal or JSX text — i.e. game text that would never
    // switch to English.
    const offenders: string[] = [];
    for (const { path, code } of FILES) {
      if (CJK_EXEMPT.includes(path.split(sep).join('/'))) continue;
      const hits = code.match(/[一-鿿]+/g);
      if (hits) offenders.push(`${path}: ${[...new Set(hits)].join(' ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('never interpolates a variable named `count`', () => {
    // i18next treats `count` as the plural selector: it looks for `key_one` /
    // `key_other` BEFORE `key`. Per-language plural variants (zh has one form,
    // en has two) would then break the zh/en key-parity test in
    // server/test/content.test.ts, which requires identical key sets. The
    // project's name for an interpolated number is `n`.
    const offenders: string[] = [];
    for (const { path, code } of FILES) {
      for (const [match] of code.matchAll(/\bt\([^)]*\bcount\s*:/gs)) {
        offenders.push(`${path}: ${match.replace(/\s+/g, ' ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has no `count` placeholder left in either locale file', () => {
    for (const [name, dict] of [['en', EN], ['zh', ZH]] as const) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value, `${name}.${key} interpolates {{count}} — use {{n}}`).not.toContain('{{count}}');
      }
    }
  });
});
