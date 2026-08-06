/**
 * 토큰 대비 자동 검사 (INV-12).
 *
 *   node tools/contrast-check.js
 *
 * `tokens.css` 를 파싱해 라이트·다크 **양쪽**의 모든 텍스트/배경 조합을 계산한다.
 * 눈으로 보고 "괜찮아 보인다"로 넘어가면, 다크 모드에서 판정색 하나가 4.5:1 아래로
 * 떨어져도 아무도 모른다. 라이트에서 멀쩡하기 때문이다.
 *
 * 기준은 WCAG 2.1: 본문 4.5:1, 큰 텍스트(18.66px 이상 또는 24px) 3:1.
 * 이 프로젝트는 판정 코드가 작은 텍스트라 전부 4.5:1 을 요구한다.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TOKENS = path.join(ROOT, 'apps', 'web', 'src', 'styles', 'tokens.css');

/** 본문 기준. 큰 텍스트에만 3:1 을 허용하지만 여기서는 전부 본문으로 본다. */
const MIN_RATIO = 4.5;

/**
 * @param {string} hex
 * @returns {[number, number, number]}
 */
function parseHex(hex) {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * WCAG 상대 휘도.
 * @param {string} hex
 * @returns {number}
 */
function luminance(hex) {
  const [r, g, b] = parseHex(hex).map((raw) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function contrast(a, b) {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * `:root[data-theme='...']` 블록별로 토큰을 뽑는다.
 * @param {string} css
 * @returns {Record<string, Record<string, string>>}
 */
function parseThemes(css) {
  /** @type {Record<string, Record<string, string>>} */
  const themes = { light: {}, dark: {} };

  // `:root`(공통), `:root[data-theme='light']`, `:root[data-theme='dark']` 블록을 훑는다.
  const blockPattern = /(:root(?:\s*,\s*:root)?\s*(?:\[data-theme='(\w+)'\])?[^{]*)\{([^}]*)\}/g;

  for (const match of css.matchAll(blockPattern)) {
    const selector = match[1] ?? '';
    const body = match[3] ?? '';
    const targets = selector.includes("data-theme='dark'")
      ? ['dark']
      : selector.includes("data-theme='light'")
        ? ['light']
        : ['light', 'dark'];

    for (const declaration of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      const name = declaration[1];
      const value = (declaration[2] ?? '').trim();
      if (!name || !value.startsWith('#')) continue;
      for (const target of targets) {
        const bucket = themes[target];
        if (bucket) bucket[name] = value;
      }
    }
  }

  return themes;
}

/** 검사할 조합. 실제로 그렇게 쓰이는 쌍만 넣는다. */
const FOREGROUNDS = [
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--accent',
  '--accent-hover',
  '--verdict-ac',
  '--verdict-wa',
  '--verdict-tle',
  '--verdict-mle',
  '--verdict-fbd',
  '--verdict-re',
  '--verdict-ce',
  '--verdict-ie',
  '--verdict-pending',
];

const BACKGROUNDS = ['--bg-canvas', '--bg-subtle', '--bg-inset', '--bg-hover'];

async function main() {
  const css = await readFile(TOKENS, 'utf8');
  const themes = parseThemes(css);

  /** @type {{ theme: string, fg: string, bg: string, ratio: number }[]} */
  const failures = [];
  let checked = 0;

  for (const [themeName, tokens] of Object.entries(themes)) {
    for (const fg of FOREGROUNDS) {
      for (const bg of BACKGROUNDS) {
        const fgValue = tokens[fg];
        const bgValue = tokens[bg];
        if (!fgValue || !bgValue) {
          failures.push({ theme: themeName, fg, bg, ratio: 0 });
          continue;
        }
        const ratio = contrast(fgValue, bgValue);
        checked += 1;
        if (ratio < MIN_RATIO) failures.push({ theme: themeName, fg, bg, ratio });
      }
    }
  }

  // INV-12 는 대비뿐 아니라 "순수 #000 배경 금지"도 요구한다.
  const darkCanvas = themes['dark']?.['--bg-canvas'] ?? '';
  const pureBlack = ['#000', '#000000'].includes(darkCanvas.toLowerCase());

  console.log(`토큰 대비 검사 — 조합 ${checked}건 (라이트·다크)\n`);

  for (const theme of ['light', 'dark']) {
    const rows = FOREGROUNDS.map((fg) => {
      const value = themes[theme]?.[fg];
      const bg = themes[theme]?.['--bg-canvas'];
      if (!value || !bg) return `  ${fg.padEnd(20)} (없음)`;
      const ratio = contrast(value, bg);
      return `  ${fg.padEnd(20)} ${ratio.toFixed(2).padStart(6)}:1  ${ratio >= MIN_RATIO ? 'AA' : '미달'}`;
    });
    console.log(`[${theme}] --bg-canvas 위\n${rows.join('\n')}\n`);
  }

  if (pureBlack) {
    console.error('INV-12 위반: 다크 모드 배경이 순수 검정이다.');
  }
  for (const failure of failures) {
    console.error(
      `INV-12 위반: [${failure.theme}] ${failure.fg} on ${failure.bg} = ${failure.ratio.toFixed(2)}:1 (기준 ${MIN_RATIO})`,
    );
  }

  if (failures.length === 0 && !pureBlack) {
    console.log(`전 조합 ${MIN_RATIO}:1 이상 통과. 다크 배경 ${darkCanvas} (순수 검정 아님).`);
    return;
  }

  process.exitCode = 1;
}

await main();
