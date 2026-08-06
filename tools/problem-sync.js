/**
 * 문제 적재·검증 CLI (docs/TECHNICAL.md §9).
 *
 *   node tools/problem-sync.js --report                    파일만 본다. Docker·DB 불필요
 *   node tools/problem-sync.js --all --verify              기대값 재생성 후 해시 대조 (INV-10)
 *   node tools/problem-sync.js --all --publish             케이스 생성 + DB 적재
 *   node tools/problem-sync.js --dir problems/0001-... --publish
 *
 * **Git 이 원본이고 DB 는 파생물이다.** 반대로 두면 문제 정의가 리뷰를 거치지 않고
 * 바뀌며, 바뀐 이유가 어디에도 남지 않는다.
 *
 * **기대값은 여기서 만들지 않는다.** 컨테이너 안의 `make_cases.py` 가 `reference.py` 로
 * 만든다 (INV-10). 이 파일에 기대값을 손보는 경로가 생기는 순간 그 규칙은 무너진다.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { PHASE1_TIERS } from '@mlca/shared';

import { checkDaemon } from '../apps/worker/src/sandbox/docker.js';
import { makeCases } from '../apps/worker/src/sandbox/make-cases.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROBLEMS_ROOT = path.join(ROOT, 'problems');
const CONCEPTS_ROOT = path.join(PROBLEMS_ROOT, '_concepts');
const RUNNER_DIR = path.join(ROOT, 'judge', 'runner');

/** 기준 구현이 이보다 오래 걸리면 입력 규모가 과하다 (M6 DoD 6). */
const REFERENCE_BUDGET_MS = 1000;

/** Phase 1 목표 분포 (docs/TECHNICAL.md §11). */
const TIER_TARGET = Object.freeze({ 1: 10, 2: 8, 4: 7, 5: 5 });

const REQUIRED_FILES = ['problem.json', 'statement.md', 'reference.py', 'generator.py', 'bypass.py'];

/** `judge/runner/ast_check.py` 의 `_OPERATOR_NODES` 와 같아야 한다. */
const KNOWN_OPERATORS = new Set(['@', '**', '//', '%']);

/**
 * `[[슬러그]]` — 렌더러가 모르는 링크 표기. 화면에 대괄호째 나온다.
 *
 * 슬러그 모양(소문자로 시작)으로 좁혀 둔다. `[[1.0]]` 같은 numpy 배열 리터럴이
 * 문제 설명의 예제에 흔히 나오는데, 느슨한 패턴은 그것까지 잡는다.
 */
const WIKI_LINK = /\[\[[a-z][a-z0-9-]*\]\]/;

const USAGE = `사용법:
  node tools/problem-sync.js --report              단계 분포·필수 항목 점검 (파일만)
  node tools/problem-sync.js --all --verify        기대값 재생성 후 해시 대조
  node tools/problem-sync.js --all --publish       케이스 생성 + DB 적재
  node tools/problem-sync.js --dir <경로> --publish

옵션:
  --all            problems/ 아래 전부
  --dir <경로>     문제 디렉터리 하나
  --verify         재생성 결과가 기존 케이스와 같은지 대조한다. DB 는 건드리지 않는다
  --publish        적재하면서 is_published = true 로 둔다
  --keep-cases     이미 케이스가 있으면 다시 만들지 않는다 (적재만)
  --prune          problems/ 에 없는 문제를 DB 에서 정리한다
  --image <태그>   채점 이미지`;

/**
 * @param {string[]} argv
 * @returns {Record<string, string|boolean>}
 */
function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

/** @param {string} target */
async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * @typedef {object} ProblemEntry
 * @property {string} dir
 * @property {string} dirName
 * @property {number} order 디렉터리 이름의 NNNN 부분. 목록의 `#` 열
 * @property {any} json
 */

/**
 * `problems/<NNNN-slug>/` 를 순번 순으로 모은다.
 * @returns {Promise<ProblemEntry[]>}
 */
async function discoverProblems() {
  const entries = await readdir(PROBLEMS_ROOT, { withFileTypes: true });
  /** @type {ProblemEntry[]} */
  const found = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const dir = path.join(PROBLEMS_ROOT, entry.name);
    if (!(await exists(path.join(dir, 'problem.json')))) continue;

    const match = /^(\d{4})-/.exec(entry.name);
    if (!match) throw new Error(`디렉터리 이름이 <NNNN-slug> 규약이 아니다: ${entry.name}`);

    found.push({
      dir,
      dirName: entry.name,
      order: Number.parseInt(match[1] ?? '0', 10),
      json: JSON.parse(await readFile(path.join(dir, 'problem.json'), 'utf8')),
    });
  }

  found.sort((left, right) => left.order - right.order);
  return found;
}

/**
 * `---` frontmatter 를 가진 개념 문서를 읽는다.
 * @returns {Promise<Array<{slug: string, title: string, tier: number, body: string}>>}
 */
async function discoverConcepts() {
  if (!(await exists(CONCEPTS_ROOT))) return [];
  const files = (await readdir(CONCEPTS_ROOT)).filter((name) => name.endsWith('.md')).sort();

  return Promise.all(
    files.map(async (name) => {
      const raw = await readFile(path.join(CONCEPTS_ROOT, name), 'utf8');
      const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
      if (!match) throw new Error(`${name}: frontmatter 가 없다`);

      /** @type {Record<string, string>} */
      const head = {};
      for (const line of (match[1] ?? '').split(/\r?\n/)) {
        const colon = line.indexOf(':');
        if (colon === -1) continue;
        head[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
      }

      const slug = head['slug'] ?? name.replace(/\.md$/, '');
      if (!head['title']) throw new Error(`${name}: title 이 없다`);
      if (!head['tier']) throw new Error(`${name}: tier 가 없다`);

      return {
        slug,
        title: head['title'],
        tier: Number.parseInt(head['tier'], 10),
        body: (match[2] ?? '').trim(),
      };
    }),
  );
}

/**
 * 파일만 보고 확인할 수 있는 것 전부. Docker·DB 없이 돈다.
 *
 * 여기서 잡히는 것은 "제한을 안 걸었다"·"예제가 없다"처럼 **없어도 채점은 도는**
 * 결함이다. 도는 것과 옳은 것은 다르므로 별도 게이트가 필요하다.
 *
 * @param {ProblemEntry[]} problems
 * @param {Array<{slug: string, body: string}>} concepts
 * @param {{whole: boolean}} scope `whole` 이면 분포·고아 개념처럼 문제집 전체에만
 *        의미가 있는 항목까지 본다. 한 문제만 손볼 때 30문제 분포로 막히면 안 된다
 * @returns {Promise<string[]>} 문제점 목록. 비어 있으면 통과
 */
async function auditProblems(problems, concepts, scope) {
  /** @type {string[]} */
  const issues = [];
  const conceptSlugs = new Set(concepts.map((item) => item.slug));
  /** @type {Map<string, string>} */
  const slugsSeen = new Map();
  /** @type {Set<number>} */
  const ordersSeen = new Set();
  const linkedConcepts = new Set();

  for (const entry of problems) {
    const label = entry.dirName;
    const json = entry.json;

    for (const file of REQUIRED_FILES) {
      if (!(await exists(path.join(entry.dir, file)))) issues.push(`${label}: ${file} 이 없다`);
    }

    if (typeof json.slug !== 'string' || !json.slug) {
      issues.push(`${label}: slug 이 없다`);
    } else {
      if (entry.dirName.replace(/^\d{4}-/, '') !== json.slug) {
        issues.push(`${label}: 디렉터리 이름과 slug 이 다르다 (${json.slug})`);
      }
      const duplicate = slugsSeen.get(json.slug);
      if (duplicate) issues.push(`${label}: slug 이 ${duplicate} 와 겹친다`);
      slugsSeen.set(json.slug, label);
    }

    if (ordersSeen.has(entry.order)) issues.push(`${label}: 순번 ${entry.order} 이 겹친다`);
    ordersSeen.add(entry.order);

    if (!PHASE1_TIERS.includes(json.tier)) {
      issues.push(`${label}: tier ${json.tier} 는 Phase 1 범위가 아니다 (${PHASE1_TIERS.join('·')})`);
    }
    if (!Number.isInteger(json.difficulty) || json.difficulty < 1 || json.difficulty > 5) {
      issues.push(`${label}: difficulty 는 1~5 정수여야 한다`);
    }
    if (json.judge_mode !== 'tolerance' && json.judge_mode !== 'structural') {
      issues.push(`${label}: judge_mode 는 tolerance·structural 둘 중 하나다`);
    }
    if (typeof json.entrypoint !== 'string' || !json.entrypoint) {
      issues.push(`${label}: entrypoint 가 없다`);
    }

    // ADR-0002 — 허용 목록이 비면 이 플랫폼은 일반 저지가 된다.
    const allowed = json.restrictions?.allowed_imports;
    if (!Array.isArray(allowed) || allowed.length === 0) {
      issues.push(`${label}: restrictions.allowed_imports 가 비었다`);
    }
    if (json.restrictions?.required_entrypoint !== json.entrypoint) {
      issues.push(`${label}: required_entrypoint 가 entrypoint 와 다르다`);
    }
    for (const token of json.restrictions?.forbidden_operators ?? []) {
      if (!KNOWN_OPERATORS.has(token)) {
        issues.push(`${label}: 알 수 없는 연산자 제한 ${token}`);
      }
    }

    const statement = await readFile(path.join(entry.dir, 'statement.md'), 'utf8').catch(() => '');
    if (!/^##\s*예제/m.test(statement)) {
      issues.push(`${label}: statement.md 에 "## 예제" 절이 없다`);
    }
    const wiki = WIKI_LINK.exec(statement);
    if (wiki) issues.push(`${label}: 렌더되지 않는 링크 표기 ${wiki[0]}`);

    const links = json.concepts;
    if (!Array.isArray(links) || links.length === 0) {
      issues.push(`${label}: 개념 링크가 없다`);
    } else {
      for (const link of links) {
        if (!conceptSlugs.has(link.slug)) {
          issues.push(`${label}: 개념 ${link.slug} 문서가 없다`);
        }
        if (link.relation !== 'prerequisite' && link.relation !== 'practice') {
          issues.push(`${label}: relation 은 prerequisite·practice 둘 중 하나다 (${link.relation})`);
        }
        linkedConcepts.add(link.slug);
      }
    }
  }

  if (scope.whole) {
    // 개념 문서가 어느 문제와도 연결되지 않으면 링크는 단방향이 된다.
    for (const concept of concepts) {
      if (!linkedConcepts.has(concept.slug)) {
        issues.push(`개념 ${concept.slug}: 연결된 문제가 없다`);
      }
      // `[[슬러그]]` 는 렌더러가 모르는 표기라 화면에 대괄호째 나온다.
      const wiki = WIKI_LINK.exec(concept.body ?? '');
      if (wiki) issues.push(`개념 ${concept.slug}: 렌더되지 않는 링크 표기 ${wiki[0]}`);
    }

    /** @type {Record<number, number>} */
    const distribution = {};
    for (const entry of problems) {
      distribution[entry.json.tier] = (distribution[entry.json.tier] ?? 0) + 1;
    }
    for (const [tier, want] of Object.entries(TIER_TARGET)) {
      const have = distribution[Number(tier)] ?? 0;
      if (have !== want) issues.push(`${tier}단계 문제 수가 ${have} 다 — 목표 ${want}`);
    }
  }

  return issues;
}

/**
 * @param {ProblemEntry[]} problems
 * @param {Array<{slug: string, tier: number}>} concepts
 */
function printReport(problems, concepts) {
  /** @type {Record<number, ProblemEntry[]>} */
  const byTier = {};
  for (const entry of problems) (byTier[entry.json.tier] ??= []).push(entry);

  console.log(`문제 ${problems.length}건 · 개념 ${concepts.length}건\n`);

  for (const tier of PHASE1_TIERS) {
    const list = byTier[tier] ?? [];
    const want = TIER_TARGET[/** @type {keyof typeof TIER_TARGET} */ (tier)] ?? 0;
    console.log(`${tier}단계  ${String(list.length).padStart(2)}/${want}`);
    for (const entry of list) {
      const imports = (entry.json.restrictions?.allowed_imports ?? []).join(', ');
      console.log(
        `   ${String(entry.order).padStart(4, '0')}  ${entry.json.title.padEnd(24)}` +
          `  난이도 ${entry.json.difficulty}  [${imports}]`,
      );
    }
    console.log('');
  }
}

/**
 * 케이스를 만들고 (또는 대조하고) 결과를 돌려준다.
 * @param {ProblemEntry} entry
 * @param {{verify: boolean, keepCases: boolean, image?: string}} options
 */
async function syncCases(entry, options) {
  const manifestPath = path.join(entry.dir, 'cases', 'manifest.json');
  const previous = (await exists(manifestPath))
    ? JSON.parse(await readFile(manifestPath, 'utf8'))
    : null;

  if (options.keepCases && previous && !options.verify) {
    return { manifest: previous, matched: /** @type {boolean|null} */ (null) };
  }

  const manifest = await makeCases({
    problemDir: entry.dir,
    runnerDir: RUNNER_DIR,
    ...(options.image === undefined ? {} : { image: options.image }),
  });

  // 같은 `generator.py` + 같은 `reference.py` + 같은 컨테이너면 바이트까지 같아야 한다.
  // 달라졌다면 둘 중 하나가 결정적이지 않다는 뜻이고, 그 문제는 재생성할 때마다
  // 다른 정답을 요구하게 된다 (INV-10).
  const matched = previous ? previous.digest === manifest.digest : null;
  return { manifest, matched };
}

/**
 * DB 적재. `--publish` 가 없으면 미공개로 들어간다.
 * @param {import('pg').Pool} pool
 * @param {ProblemEntry[]} problems
 * @param {Array<{slug: string, title: string, tier: number, body: string}>} concepts
 * @param {{publish: boolean, prune: boolean}} options
 */
async function loadIntoDb(pool, problems, concepts, options) {
  /** @type {Map<string, string>} */
  const problemIds = new Map();

  for (const entry of problems) {
    const json = entry.json;
    const statement = await readFile(path.join(entry.dir, 'statement.md'), 'utf8');

    const inserted = await pool.query(
      `INSERT INTO problems (slug, title, tier, difficulty, judge_mode, entrypoint,
                             time_limit_ms, memory_limit_mb, restrictions, compare_options,
                             statement_md, is_published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (slug) DO UPDATE
          SET title = EXCLUDED.title, tier = EXCLUDED.tier, difficulty = EXCLUDED.difficulty,
              judge_mode = EXCLUDED.judge_mode, entrypoint = EXCLUDED.entrypoint,
              time_limit_ms = EXCLUDED.time_limit_ms, memory_limit_mb = EXCLUDED.memory_limit_mb,
              restrictions = EXCLUDED.restrictions, compare_options = EXCLUDED.compare_options,
              statement_md = EXCLUDED.statement_md, is_published = EXCLUDED.is_published
       RETURNING id`,
      [
        json.slug,
        json.title,
        json.tier,
        json.difficulty,
        json.judge_mode,
        json.entrypoint,
        json.time_limit_ms ?? 10000,
        json.memory_limit_mb ?? 512,
        json.restrictions ?? {},
        json.compare_options ?? {},
        statement.trim(),
        options.publish,
      ],
    );
    problemIds.set(json.slug, inserted.rows[0].id);

    // 태그는 문제 정의를 따라 다시 맞춘다. 지웠다 넣지 않으면 문제에서 뺀 태그가 남는다.
    await pool.query(`DELETE FROM problem_tags WHERE problem_id = $1`, [inserted.rows[0].id]);
    for (const name of json.tags ?? []) {
      await pool.query(`INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
      await pool.query(
        `INSERT INTO problem_tags (problem_id, tag_id)
         SELECT $1, id FROM tags WHERE name = $2 ON CONFLICT DO NOTHING`,
        [inserted.rows[0].id, name],
      );
    }
  }

  for (const concept of concepts) {
    await pool.query(
      `INSERT INTO concepts (slug, title, tier, body_md)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (slug) DO UPDATE
          SET title = EXCLUDED.title, tier = EXCLUDED.tier, body_md = EXCLUDED.body_md`,
      [concept.slug, concept.title, concept.tier, concept.body],
    );
  }

  // 링크도 문제 정의가 원본이다. 문제 단위로 지우고 다시 넣는다 — 전체를 지우면
  // `--dir` 로 한 문제만 적재할 때 나머지 문제의 링크가 함께 사라진다.
  let linkCount = 0;
  for (const entry of problems) {
    const problemId = problemIds.get(entry.json.slug);
    await pool.query(`DELETE FROM concept_problem_links WHERE problem_id = $1`, [problemId]);
    for (const link of entry.json.concepts ?? []) {
      await pool.query(
        `INSERT INTO concept_problem_links (concept_id, problem_id, relation)
         SELECT id, $2, $3 FROM concepts WHERE slug = $1
         ON CONFLICT DO NOTHING`,
        [link.slug, problemId, link.relation],
      );
      linkCount += 1;
    }
  }

  /** @type {string[]} */
  const pruned = [];
  if (options.prune) {
    const slugs = problems.map((entry) => entry.json.slug);
    // 제출이 달린 문제는 지우지 않는다. 지우면 그 사용자의 제출 이력이 함께 사라진다.
    // 대신 미공개로 내려 목록에서 빠지게 한다.
    const orphans = await pool.query(
      `SELECT p.slug, count(s.id)::int AS submissions
         FROM problems p LEFT JOIN submissions s ON s.problem_id = p.id
        WHERE NOT (p.slug = ANY($1::text[]))
        GROUP BY p.slug`,
      [slugs],
    );
    for (const row of orphans.rows) {
      if (row.submissions === 0) {
        await pool.query(`DELETE FROM problems WHERE slug = $1`, [row.slug]);
        pruned.push(`${row.slug} (삭제)`);
      } else {
        await pool.query(`UPDATE problems SET is_published = false WHERE slug = $1`, [row.slug]);
        pruned.push(`${row.slug} (제출 ${row.submissions}건 — 미공개 처리)`);
      }
    }
  }

  return { problems: problemIds.size, concepts: concepts.length, links: linkCount, pruned };
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags['help']) {
    console.log(USAGE);
    return;
  }

  const concepts = await discoverConcepts();
  const all = await discoverProblems();

  const selected =
    typeof flags['dir'] === 'string'
      ? all.filter((entry) => path.resolve(entry.dir) === path.resolve(ROOT, String(flags['dir'])))
      : all;

  if (typeof flags['dir'] === 'string' && selected.length === 0) {
    console.error(`문제 디렉터리를 찾을 수 없다: ${flags['dir']}`);
    process.exitCode = 2;
    return;
  }

  // --report 는 분포·누락만 본다. 문제를 쓰는 도중에도 돌 수 있어야 하므로
  // Docker 도 DB 도 요구하지 않는다.
  if (flags['report'] || (!flags['all'] && !flags['dir'])) {
    printReport(all, concepts);
    const issues = await auditProblems(all, concepts, { whole: true });
    if (issues.length > 0) {
      console.log(`문제점 ${issues.length}건`);
      for (const issue of issues) console.log(`  - ${issue}`);
      process.exitCode = 1;
    } else {
      console.log('점검 통과 — 필수 항목·개념 링크·단계 분포 이상 없음');
    }
    return;
  }

  const issues = await auditProblems(selected, concepts, { whole: selected.length === all.length });
  if (issues.length > 0) {
    console.error(`적재 전 점검에서 ${issues.length}건이 걸렸다:`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
    return;
  }

  const daemon = await checkDaemon();
  if (!daemon.ok) {
    console.error(`Docker 데몬에 연결할 수 없다: ${daemon.message}`);
    console.error('기대값은 채점과 같은 컨테이너에서 만들어야 한다 (INV-10).');
    process.exitCode = 2;
    return;
  }

  const verify = Boolean(flags['verify']);
  const image = typeof flags['image'] === 'string' ? flags['image'] : undefined;

  /** @type {string[]} */
  const failures = [];
  let slowest = { slug: '', ms: -1 };

  for (const [index, entry] of selected.entries()) {
    const position = `[${String(index + 1).padStart(2)}/${selected.length}]`;
    try {
      const { manifest, matched } = await syncCases(entry, {
        verify,
        keepCases: Boolean(flags['keep-cases']),
        ...(image === undefined ? {} : { image }),
      });

      if (manifest.reference_ms > slowest.ms) {
        slowest = { slug: entry.json.slug, ms: manifest.reference_ms };
      }

      const budget = manifest.reference_ms > REFERENCE_BUDGET_MS ? ' 기준 구현이 느리다' : '';
      if (budget) failures.push(`${entry.json.slug}: 기준 구현 ${manifest.reference_ms}ms — 상한 ${REFERENCE_BUDGET_MS}ms`);

      if (verify && matched === false) {
        failures.push(`${entry.json.slug}: 재생성 결과가 기존 케이스와 다르다 (INV-10)`);
        console.log(`${position} ${entry.json.slug}  해시 불일치`);
      } else {
        const mark = verify ? (matched === null ? '신규' : '일치') : '생성';
        console.log(
          `${position} ${entry.json.slug.padEnd(26)} ${mark}  ` +
            `케이스 ${String(manifest.case_count).padStart(2)}건  ` +
            `${String(manifest.reference_ms).padStart(4)}ms${budget}`,
        );
      }
    } catch (error) {
      failures.push(`${entry.json.slug}: ${String(error).split('\n')[0]}`);
      console.log(`${position} ${entry.json.slug}  실패`);
      console.log(`      ${String(error).replaceAll('\n', '\n      ')}`);
    }
  }

  console.log('');
  console.log(`기준 구현 최장  ${slowest.slug} ${slowest.ms}ms  (상한 ${REFERENCE_BUDGET_MS}ms)`);

  if (failures.length > 0) {
    console.error(`\n실패 ${failures.length}건`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  if (verify) {
    console.log(`검증 통과 — ${selected.length}문제의 기대값이 재생성 결과와 일치한다 (INV-10)`);
    return;
  }

  const { closePool, getPool } = await import('../apps/worker/src/result/db.js');
  const pool = getPool();
  try {
    const summary = await loadIntoDb(pool, selected, concepts, {
      publish: Boolean(flags['publish']),
      // 정리는 문제집 전체를 볼 때만 뜻이 있다. 한 문제만 적재하면서 정리하면
      // 나머지 29문제가 "problems/ 에 없는 문제"로 보인다.
      prune: Boolean(flags['prune']) && selected.length === all.length,
    });
    console.log(
      `적재 완료 — 문제 ${summary.problems}건 · 개념 ${summary.concepts}건 · 링크 ${summary.links}건` +
        `${flags['publish'] ? ' (공개)' : ' (미공개)'}`,
    );
    for (const item of summary.pruned) console.log(`  정리  ${item}`);
  } finally {
    await closePool();
  }
}

await main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
