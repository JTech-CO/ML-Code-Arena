/**
 * 개발용 시드 — 화면을 검증할 만큼의 데이터를 넣는다.
 *
 *   node --env-file-if-exists=.env tools/seed-dev.js
 *
 * **M6 의 실제 콘텐츠가 아니다.** M6 는 `problem-sync` 로 파일 시스템의 문제 정의를
 * 적재하며 그때 이 행들은 대체된다. 여기 있는 것은 UI 게이트(목록 밀도·필터·양방향
 * 링크)를 확인하는 데 필요한 최소한이다.
 *
 * 실제로 채점되는 문제는 `l2norm` 하나다 — 케이스 파일이 있는 것이 그것뿐이다.
 * 나머지는 미공개로 두지 않으면 목록에서 눌렀을 때 채점이 IE 로 떨어진다.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { closePool, getPool } from '../apps/worker/src/result/db.js';
import { resolveProblemDir } from '../apps/worker/src/sandbox/problem-dir.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** 목록 밀도(15행 이상)를 확인하기 위한 표본. 제목은 백서 §6.3 예시를 따른다. */
const SAMPLES = [
  { tier: 1, difficulty: 1, title: '브로드캐스팅 shape 계산', tags: ['numpy'] },
  { tier: 1, difficulty: 1, title: 'L2 노름 직접 구현', tags: ['numpy'] },
  { tier: 1, difficulty: 2, title: '공분산 행렬', tags: ['numpy', 'statistics'] },
  { tier: 1, difficulty: 2, title: '행렬 곱 직접 구현', tags: ['numpy'] },
  { tier: 1, difficulty: 3, title: '고윳값 거듭제곱법', tags: ['numpy'] },
  { tier: 2, difficulty: 2, title: 'k-최근접 이웃 분류', tags: ['classification'] },
  { tier: 2, difficulty: 2, title: '나이브 베이즈 분류', tags: ['classification'] },
  { tier: 2, difficulty: 3, title: '결정 트리 분기 기준', tags: ['classification'] },
  { tier: 2, difficulty: 3, title: 'k-평균 군집화', tags: ['clustering'] },
  { tier: 2, difficulty: 4, title: '주성분 분석', tags: ['numpy'] },
  { tier: 4, difficulty: 1, title: '혼동행렬 계산', tags: ['metrics'] },
  { tier: 4, difficulty: 2, title: '정밀도·재현율·F1', tags: ['metrics'] },
  { tier: 4, difficulty: 3, title: 'ROC 곡선과 AUC', tags: ['metrics'] },
  { tier: 4, difficulty: 3, title: 'k-겹 교차검증 분할', tags: ['metrics'] },
  { tier: 5, difficulty: 2, title: '1차원 경사하강법', tags: ['optimization'] },
  { tier: 5, difficulty: 3, title: '모멘텀 경사하강법', tags: ['optimization'] },
  { tier: 5, difficulty: 4, title: 'Adam 옵티마이저', tags: ['optimization'] },
];

const CONCEPTS = [
  {
    slug: 'gradient-descent',
    title: '경사하강법',
    tier: 5,
    body: `## 무엇을 하는가

기울기의 반대 방향으로 조금씩 이동하며 함수의 최솟값을 찾는다.

    x ← x − lr · f'(x)

## 왜 직접 구현하는가

\`scipy.optimize.minimize\` 한 줄로 끝나는 일이지만, 학습률이 너무 크면 발산하고
너무 작으면 수렴하지 않는다는 것은 직접 짜 보기 전까지 손에 잡히지 않는다.

## 흔한 실수

기울기 부호를 반대로 쓰는 것, 그리고 갱신을 반복문 밖에서 하는 것이다.`,
    links: [{ index: 14, relation: 'practice' }],
  },
  {
    slug: 'confusion-matrix',
    title: '혼동행렬',
    tier: 4,
    body: `## 무엇을 하는가

분류 결과를 실제와 예측의 2차원 표로 정리한다. 정확도 하나로는 보이지 않는 것을 드러낸다.

## 왜 직접 구현하는가

불균형 데이터에서 정확도 95%가 아무 의미 없다는 사실은 혼동행렬을 직접 채워 봐야 안다.

## 흔한 실수

축을 바꿔 놓는 것이다. 행이 실제인지 예측인지 문서마다 다르므로 문제의 정의를 따른다.`,
    links: [{ index: 10, relation: 'practice' }],
  },
];

/**
 * 슬러그는 순번으로 만든다. M6 가 `problem-sync` 로 실제 슬러그를 넣을 때 이 행들은
 * 사라지므로 의미 있는 이름을 붙이지 않는다.
 * @param {number} index
 * @returns {string}
 */
function toSlug(index) {
  return `p${String(index + 1).padStart(3, '0')}`;
}

async function main() {
  const pool = getPool();

  // 실제로 채점 가능한 문제 — 케이스 파일이 있다.
  const l2normDir = await resolveProblemDir('l2norm', ROOT);
  const l2norm = JSON.parse(await readFile(path.join(l2normDir, 'problem.json'), 'utf8'));

  await pool.query(
    `INSERT INTO problems (slug, title, tier, difficulty, entrypoint, time_limit_ms,
                           memory_limit_mb, restrictions, compare_options, statement_md, is_published)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
     ON CONFLICT (slug) DO UPDATE
        SET restrictions = EXCLUDED.restrictions, compare_options = EXCLUDED.compare_options,
            entrypoint = EXCLUDED.entrypoint, statement_md = EXCLUDED.statement_md,
            is_published = true`,
    [
      l2norm.slug,
      '행 단위 L2 정규화',
      l2norm.tier,
      l2norm.difficulty,
      l2norm.entrypoint,
      l2norm.time_limit_ms ?? 10000,
      l2norm.memory_limit_mb ?? 512,
      l2norm.restrictions ?? {},
      l2norm.compare_options ?? {},
      `2차원 배열의 각 **행**을 L2 노름으로 나누어 정규화한 배열을 반환하라.

행 \`v\` 에 대해 결과는 \`v / ||v||₂\` 이며, shape 는 입력과 같다.

## 예제

    solve(np.array([[3.0, 4.0]]))  →  [[0.6, 0.8]]

## 주의

\`numpy.linalg.norm\` 은 사용할 수 없다. 노름을 직접 계산해야 한다.`,
    ],
  );

  // 태그
  const tagNames = [...new Set(SAMPLES.flatMap((s) => s.tags))];
  for (const name of tagNames) {
    await pool.query(`INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
  }

  /** @type {string[]} */
  const sampleIds = [];

  for (const [index, sample] of SAMPLES.entries()) {
    const slug = toSlug(index);
    const inserted = await pool.query(
      `INSERT INTO problems (slug, title, tier, difficulty, entrypoint, restrictions,
                             statement_md, is_published)
       VALUES ($1,$2,$3,$4,'solve',$5,$6,true)
       ON CONFLICT (slug) DO UPDATE
          SET title = EXCLUDED.title, tier = EXCLUDED.tier, difficulty = EXCLUDED.difficulty,
              restrictions = EXCLUDED.restrictions, statement_md = EXCLUDED.statement_md
       RETURNING id`,
      [
        slug,
        sample.title,
        sample.tier,
        sample.difficulty,
        JSON.stringify({
          allowed_imports: ['numpy'],
          forbidden_attributes: sample.tags.includes('metrics') ? ['sklearn.metrics'] : [],
          required_entrypoint: 'solve',
        }),
        `준비 중인 문제입니다. M6 에서 문제 정의와 테스트케이스가 채워집니다.`,
      ],
    );
    sampleIds.push(inserted.rows[0].id);

    for (const tag of sample.tags) {
      await pool.query(
        `INSERT INTO problem_tags (problem_id, tag_id)
         SELECT $1, id FROM tags WHERE name = $2
         ON CONFLICT DO NOTHING`,
        [inserted.rows[0].id, tag],
      );
    }
  }

  // 개념 + 양방향 링크
  for (const concept of CONCEPTS) {
    const inserted = await pool.query(
      `INSERT INTO concepts (slug, title, tier, body_md)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, body_md = EXCLUDED.body_md
       RETURNING id`,
      [concept.slug, concept.title, concept.tier, concept.body],
    );

    for (const link of concept.links) {
      const problemId = sampleIds[link.index];
      if (!problemId) continue;
      await pool.query(
        `INSERT INTO concept_problem_links (concept_id, problem_id, relation)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [inserted.rows[0].id, problemId, link.relation],
      );
    }
  }

  const counts = await pool.query(
    `SELECT (SELECT count(*) FROM problems WHERE is_published)::int AS problems,
            (SELECT count(*) FROM concepts)::int AS concepts,
            (SELECT count(*) FROM tags)::int AS tags,
            (SELECT count(*) FROM concept_problem_links)::int AS links`,
  );

  console.log(`시드 완료 — ${JSON.stringify(counts.rows[0])}`);
  console.log('채점 가능한 문제: l2norm (케이스 파일이 있는 유일한 문제)');
  await closePool();
}

await main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
