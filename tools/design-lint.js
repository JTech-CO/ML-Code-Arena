/**
 * 금지 패턴 점검 (docs/DESIGN.md §12, M4 DoD 5·8).
 *
 *   node tools/design-lint.js
 *
 * 두 가지를 본다.
 *
 * 1. **색 리터럴이 `tokens.css` 밖에 있는가.** 컴포넌트에 색을 직접 쓰는 순간 다크
 *    모드가 조용히 깨진다. 라이트에서 멀쩡해 보이므로 발견이 늦다. 형식 검사가
 *    아니라 실질 방어다.
 * 2. **§12 금지 목록에 걸리는 것이 있는가.** 그라데이션 텍스트·글래스모피즘·네온
 *    글로우·무한 반복 애니메이션 등은 코드 리뷰에서 반려 대상이라고 백서가 정했다.
 *    사람이 매번 눈으로 찾으면 언젠가 놓친다.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WEB_SRC = path.join(ROOT, 'apps', 'web', 'src');

/** 색 리터럴이 허용되는 유일한 파일. */
const TOKENS_FILE = path.join(WEB_SRC, 'styles', 'tokens.css');

/**
 * §12 금지 목록 + 스킬 차원의 클리셰.
 * @type {{ id: string, pattern: RegExp, reason: string }[]}
 */
const FORBIDDEN = [
  {
    id: 'gradient-text',
    pattern: /background-clip\s*:\s*text|-webkit-background-clip\s*:\s*text/i,
    reason: '그라데이션 텍스트 (§12)',
  },
  {
    id: 'gradient',
    pattern: /linear-gradient|radial-gradient|conic-gradient/i,
    reason: '그라데이션 (§12 — 중성색 1계열 + accent 1색만)',
  },
  {
    id: 'glassmorphism',
    pattern: /backdrop-filter|backdrop-blur/i,
    reason: '글래스모피즘 (§12)',
  },
  {
    id: 'neon-glow',
    pattern: /text-shadow\s*:\s*0\s+0|drop-shadow\(\s*0\s+0/i,
    reason: '네온 글로우 (§12)',
  },
  {
    id: 'infinite-animation',
    pattern: /animation-iteration-count\s*:\s*infinite|animation\s*:[^;]*\binfinite\b/i,
    reason: '무한 반복 장식 애니메이션 (§9 금지)',
  },
  {
    id: 'hover-transform',
    pattern: /:hover[^{]*\{[^}]*transform\s*:\s*(?!none)/i,
    reason: '호버 시 이동·스케일·회전 (§6.3 — 호버는 배경색 변화만)',
  },
  {
    id: 'decorative-emoji',
    // 장식용 이모지. 기능적 콘텐츠가 아닌 UI 문자열에는 쓰지 않는다 (§11.1).
    pattern: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
    reason: '장식용 이모지 (§11.1 — 이모지를 사용하지 않는다)',
  },
];

/** 색 리터럴. `#fff`·`#ffffff`·`rgb(...)`·`hsl(...)`. */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;

/**
 * 색 리터럴로 오인되기 쉬운 것들. 색이 아니다.
 * @param {string} line
 */
function isColorFalsePositive(line) {
  // 그림자 alpha 표기는 tokens.css 안에서만 쓰이고, 여기서는 주석·URL 프래그먼트를 거른다.
  const trimmed = line.trim();
  return (
    trimmed.startsWith('*') ||
    trimmed.startsWith('//') ||
    /href=["'']#/.test(line) ||
    /url\(#/.test(line)
  );
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function collect(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(full)));
    else if (/\.(jsx?|css)$/.test(entry.name)) files.push(full);
  }
  return files;
}

async function main() {
  const files = await collect(WEB_SRC);

  /** @type {{ file: string, line: number, rule: string, reason: string, text: string }[]} */
  const violations = [];

  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    const lines = (await readFile(file, 'utf8')).split('\n');

    lines.forEach((text, index) => {
      const lineNumber = index + 1;

      if (file !== TOKENS_FILE && COLOR_LITERAL.test(text) && !isColorFalsePositive(text)) {
        violations.push({
          file: relative,
          line: lineNumber,
          rule: 'color-literal',
          reason: '색 리터럴은 tokens.css 에만 (M4 DoD 5)',
          text: text.trim(),
        });
      }

      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(text)) {
          violations.push({
            file: relative,
            line: lineNumber,
            rule: rule.id,
            reason: rule.reason,
            text: text.trim(),
          });
        }
      }
    });
  }

  // font-family 종류 세기 (§4.1 — 서체는 2종을 넘지 않는다).
  const tokensCss = await readFile(TOKENS_FILE, 'utf8');
  const families = [...tokensCss.matchAll(/--font-(\w+)\s*:/g)].map((m) => m[1]);

  console.log(`디자인 린트 — 파일 ${files.length}개`);
  console.log(`  font-family 종류: ${families.length} (${families.join(', ')})`);

  if (families.length > 2) {
    violations.push({
      file: 'apps/web/src/styles/tokens.css',
      line: 0,
      rule: 'font-count',
      reason: `서체는 2종을 넘지 않는다 (§4.1) — 현재 ${families.length}종`,
      text: families.join(', '),
    });
  }

  if (violations.length === 0) {
    console.log('  위반 0건');
    return;
  }

  console.error(`\n위반 ${violations.length}건:`);
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}  [${violation.rule}] ${violation.reason}`);
    console.error(`    ${violation.text}`);
  }
  process.exitCode = 1;
}

await main();
