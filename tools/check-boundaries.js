/**
 * 모듈 경계 룰(INV-3)이 **실제로 위반을 막는지** 검증한다.
 *
 * 설정이 "돈다"는 것과 룰이 "막는다"는 것은 다르다. eslint 설정을 잘못 건드리면
 * 룰이 조용히 비활성화되고, 위반은 M3~M5 에서 누적된 뒤에야 발견된다.
 * 그래서 의도적 위반 샘플을 만들어 → 린트 → 차단 확인 → 샘플 제거까지를 자동화한다.
 * (phases/M0_scaffolding.md DoD 2·3)
 *
 * 사용: node tools/check-boundaries.js
 * 종료 코드 0 = 모든 위반이 차단됨, 1 = 하나라도 통과해버림.
 */

import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * 위반 샘플 1건.
 * `fixtures` 는 샘플이 import 할 대상을 임시로 만들어야 할 때만 쓴다.
 *
 * @typedef {object} Probe
 * @property {string} name 사람이 읽을 설명
 * @property {string} file 리포지토리 루트 기준 경로
 * @property {string} source 파일 내용
 * @property {string} expectRule 이 위반을 잡아야 하는 룰 ID
 * @property {{ file: string, source: string }[]} [fixtures] 함께 만들 임시 대상 파일
 */

const PROBE_BASENAME = '__boundary_probe__';

/** @type {Probe[]} */
const PROBES = [
  {
    name: 'apps/web → apps/api (상대 경로)',
    file: `apps/web/src/${PROBE_BASENAME}.js`,
    source: "import { buildServer } from '../../api/src/server.js';\nexport default buildServer;\n",
    expectRule: 'import/no-restricted-paths',
  },
  {
    name: 'apps/web → @mlca/api (패키지 이름)',
    file: `apps/web/src/${PROBE_BASENAME}_pkg.js`,
    source: "import x from '@mlca/api';\nexport default x;\n",
    expectRule: 'no-restricted-imports',
  },
  {
    name: 'apps/api → apps/worker (상대 경로)',
    file: `apps/api/src/${PROBE_BASENAME}.js`,
    source: "import { loadConfig } from '../../worker/src/config.js';\nexport default loadConfig;\n",
    expectRule: 'import/no-restricted-paths',
  },
  {
    name: 'apps/worker → apps/api (상대 경로)',
    file: `apps/worker/src/${PROBE_BASENAME}.js`,
    source: "import { buildServer } from '../../api/src/server.js';\nexport default buildServer;\n",
    expectRule: 'import/no-restricted-paths',
  },
  {
    name: 'packages/shared → apps/api (역방향, 상대 경로)',
    file: `packages/shared/src/${PROBE_BASENAME}.js`,
    source:
      "import { buildServer } from '../../../apps/api/src/server.js';\nexport default buildServer;\n",
    expectRule: 'import/no-restricted-paths',
  },
  {
    name: 'packages/shared → @mlca/api (역방향, 패키지 이름)',
    file: `packages/shared/src/${PROBE_BASENAME}_pkg.js`,
    source: "import x from '@mlca/api';\nexport default x;\n",
    expectRule: 'no-restricted-imports',
  },
  {
    // 루트 devDependency 를 고른 것은 의도다. `no-extraneous-dependencies` 는
    // **해석되지 않는** import 를 조용히 건너뛴다. `fastify` 처럼 apps/api 에만 있는 패키지는
    // pnpm 의 격리된 node_modules 때문에 shared 에서 해석 자체가 안 되므로 룰이 발화하지 않고,
    // 그러면 "차단됐다"가 아니라 "검사를 안 했다"가 된다.
    // 루트에 올라온 패키지는 shared 에서도 해석되므로 룰이 실제로 발화한다.
    name: 'packages/shared → 외부 의존 (순수성 위반)',
    file: `packages/shared/src/${PROBE_BASENAME}_dep.js`,
    source: "import ts from 'typescript';\nexport default ts;\n",
    expectRule: 'import/no-extraneous-dependencies',
  },
  {
    name: 'apps/worker → judge/ (JS 는 judge 를 import 할 수 없다)',
    file: `apps/worker/src/${PROBE_BASENAME}_judge.js`,
    source: "import x from '../../../judge/__boundary_probe_target__.js';\nexport default x;\n",
    expectRule: 'import/no-restricted-paths',
    fixtures: [
      {
        file: 'judge/__boundary_probe_target__.js',
        source: 'export default null;\n',
      },
    ],
  },
];

/** 모든 샘플·픽스처 파일의 절대 경로. */
const ALL_FILES = PROBES.flatMap((probe) => [
  path.join(ROOT, probe.file),
  ...(probe.fixtures ?? []).map((fixture) => path.join(ROOT, fixture.file)),
]);

async function cleanup() {
  await Promise.all(ALL_FILES.map((file) => rm(file, { force: true })));
}

async function main() {
  // 이전 실행이 비정상 종료했을 수 있으므로 먼저 치운다.
  await cleanup();

  /** @type {{ name: string, expectRule: string, blocked: boolean, rules: string[] }[]} */
  const results = [];

  try {
    for (const probe of PROBES) {
      for (const fixture of probe.fixtures ?? []) {
        await writeFile(path.join(ROOT, fixture.file), fixture.source, 'utf8');
      }
      await writeFile(path.join(ROOT, probe.file), probe.source, 'utf8');
    }

    const eslint = new ESLint({ cwd: ROOT });

    for (const probe of PROBES) {
      const target = path.join(ROOT, probe.file);
      const [result] = await eslint.lintFiles([target]);
      const rules = (result?.messages ?? [])
        .filter((message) => message.severity === 2 && message.ruleId)
        .map((message) => /** @type {string} */ (message.ruleId));

      results.push({
        name: probe.name,
        expectRule: probe.expectRule,
        blocked: rules.includes(probe.expectRule),
        rules: [...new Set(rules)],
      });
    }
  } finally {
    await cleanup();
  }

  let failed = 0;

  for (const result of results) {
    const mark = result.blocked ? 'BLOCKED' : 'LEAKED ';
    if (!result.blocked) failed += 1;
    console.log(
      `[${mark}] ${result.name}\n           기대 룰: ${result.expectRule} / 실제: ${
        result.rules.length > 0 ? result.rules.join(', ') : '(에러 없음)'
      }`,
    );
  }

  console.log(`\n경계 샘플 ${results.length}건 중 ${results.length - failed}건 차단됨.`);

  if (failed > 0) {
    console.error(
      `\nINV-3 위반: ${failed}건이 린트를 통과했다. 경계 룰이 실효하지 않는다.\n` +
        'eslint.config.js 의 BOUNDARY_ZONES 와 docs/FILE_TREE.md §3 를 대조할 것.',
    );
    process.exitCode = 1;
  }
}

await main();
