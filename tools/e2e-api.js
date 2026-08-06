/**
 * M3 종단 게이트 — 진짜 HTTP 로 제출하고 진짜 워커가 채점한 결과를 받는다.
 *
 *   pnpm db:up && pnpm db:migrate
 *   pnpm dev:api      # 별도 터미널
 *   pnpm dev:worker   # 별도 터미널
 *   node --env-file-if-exists=.env tools/e2e-api.js
 *
 * `apps/api` 의 단위 테스트는 `inject()` 로 라우트만 두드리고 큐는 가짜다.
 * 여기서는 API → 큐 → 워커 → DB → API 왕복 전체를 탄다. 두 계층이 각자 맞는데
 * 이어 붙이면 안 도는 경우가 있고, 그건 종단으로만 드러난다.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { closePool, getPool } from '../apps/worker/src/result/db.js';
import { resolveProblemDir } from '../apps/worker/src/sandbox/problem-dir.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:3000';

/** @type {{ name: string, ok: boolean, detail: string }[]} */
const results = [];

/**
 * @param {string} name
 * @param {boolean} ok
 * @param {string} [detail]
 */
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `\n       ${detail}` : ''}`);
}

/** 쿠키를 이어받는 최소 클라이언트. */
function createClient() {
  /** @type {Map<string, string>} */
  const jar = new Map();

  return {
    /**
     * @param {string} url
     * @param {RequestInit} [init]
     */
    async fetch(url, init = {}) {
      const headers = new Headers(init.headers ?? {});
      if (jar.size > 0) {
        headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
      }
      if (init.body && !headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }

      const response = await fetch(`${BASE}${url}`, { ...init, headers });

      for (const raw of response.headers.getSetCookie?.() ?? []) {
        const pair = raw.split(';')[0] ?? '';
        const index = pair.indexOf('=');
        if (index > 0) {
          const name = pair.slice(0, index);
          const value = pair.slice(index + 1);
          if (value === '') jar.delete(name);
          else jar.set(name, value);
        }
      }
      return response;
    },
  };
}

/**
 * 문제를 DB 에 올린다. M6 의 problem-sync 가 할 일을 최소 형태로 대신한다.
 * @param {string} slug
 * @returns {Promise<void>}
 */
async function seedProblem(slug) {
  const dir = await resolveProblemDir(slug, ROOT);
  const problem = JSON.parse(await readFile(path.join(dir, 'problem.json'), 'utf8'));

  await getPool().query(
    `INSERT INTO problems (slug, title, tier, difficulty, entrypoint,
                           time_limit_ms, memory_limit_mb, restrictions, compare_options, is_published)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
     ON CONFLICT (slug) DO UPDATE
        SET restrictions = EXCLUDED.restrictions,
            compare_options = EXCLUDED.compare_options,
            entrypoint = EXCLUDED.entrypoint,
            is_published = true`,
    [
      problem.slug,
      problem.title,
      problem.tier,
      problem.difficulty,
      problem.entrypoint,
      problem.time_limit_ms ?? 10000,
      problem.memory_limit_mb ?? 512,
      problem.restrictions ?? {},
      problem.compare_options ?? {},
    ],
  );
}

/**
 * @param {ReturnType<typeof createClient>} client
 * @param {string} id
 * @param {number} [timeoutMs]
 * @returns {Promise<Record<string, any>>}
 */
async function waitForVerdict(client, id, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await client.fetch(`/api/submissions/${id}`);
    const body = /** @type {Record<string, any>} */ (await response.json());
    if (body['status'] === 'DONE') return body;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`제출 ${id} 가 시간 안에 DONE 이 되지 않았다`);
}

/**
 * SSE 를 열고 정해진 시간 동안 받은 이벤트를 모은다.
 * @param {number} durationMs
 */
async function collectStream(durationMs) {
  const controller = new AbortController();
  /** @type {Record<string, any>[]} */
  const events = [];

  const done = (async () => {
    const response = await fetch(`${BASE}/api/stream/submissions`, { signal: controller.signal });
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done: finished, value } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        for (const chunk of buffer.split('\n\n')) {
          const line = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (line) events.push(JSON.parse(line.slice(6)));
        }
        buffer = buffer.endsWith('\n\n') ? '' : buffer;
      }
    } catch {
      // abort 로 끝난다.
    }
  })();

  return {
    events,
    async stop() {
      setTimeout(() => controller.abort(), durationMs);
      await done.catch(() => {});
      return events;
    },
  };
}

async function main() {
  try {
    const health = await fetch(`${BASE}/health`);
    if (!health.ok) throw new Error(`상태 ${health.status}`);
  } catch (error) {
    console.error(`API 에 연결할 수 없다 (${BASE}): ${String(error)}`);
    console.error('pnpm dev:api 와 pnpm dev:worker 를 먼저 띄울 것.');
    process.exitCode = 2;
    return;
  }

  await seedProblem('l2norm');

  const client = createClient();
  const stamp = Date.now();

  await client.fetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: `e2e-${stamp}@example.com`,
      handle: `e2e${stamp % 100000}`,
      password: 'password12345',
    }),
  });

  const stream = await collectStream(0);

  // --- 정답 제출 -----------------------------------------------------------
  const acSource = await readFile(path.join(ROOT, 'judge/fixtures/submissions/ac.py'), 'utf8');
  const accepted = await client.fetch('/api/submissions', {
    method: 'POST',
    body: JSON.stringify({ problem_slug: 'l2norm', language: 'python', source: acSource }),
  });
  const acceptedBody = /** @type {Record<string, any>} */ (await accepted.json());

  record(
    'POST /api/submissions 가 202 와 submission_id · queue_position 을 준다',
    accepted.status === 202 &&
      typeof acceptedBody['submission_id'] === 'string' &&
      typeof acceptedBody['queue_position'] === 'number',
    `status=${accepted.status} body=${JSON.stringify(acceptedBody)}`,
  );

  const acResult = await waitForVerdict(client, acceptedBody['submission_id']);
  record(
    '워커가 채점한 결과를 GET /api/submissions/:id 가 돌려준다',
    acResult['verdict'] === 'AC',
    `verdict=${acResult['verdict']} runtime=${acResult['runtime_ms']}ms memory=${acResult['memory_mb']}MB`,
  );

  // --- 오답 제출 (INV-5 종단 확인) -----------------------------------------
  const waSource = await readFile(path.join(ROOT, 'judge/fixtures/submissions/wa_shape.py'), 'utf8');
  await new Promise((resolve) => setTimeout(resolve, 11_000)); // 문제당 쿨다운 10초

  const wrong = await client.fetch('/api/submissions', {
    method: 'POST',
    body: JSON.stringify({ problem_slug: 'l2norm', language: 'python', source: waSource }),
  });
  const wrongBody = /** @type {Record<string, any>} */ (await wrong.json());
  const waResult = await waitForVerdict(client, wrongBody['submission_id']);

  record(
    'shape 불일치가 WA 로 오고 기대 shape 가 함께 온다',
    waResult['verdict'] === 'WA' && Array.isArray(waResult['detail']?.expected_shape),
    `verdict=${waResult['verdict']} detail=${JSON.stringify(waResult['detail'])}`,
  );

  // 응답 전문에 제출 원문이 있는지 본다 (INV-5).
  const raw = await (await client.fetch(`/api/submissions/${wrongBody['submission_id']}`)).text();
  const expectStrings = await getPool().query(`SELECT source FROM submissions WHERE id = $1`, [
    wrongBody['submission_id'],
  ]);
  record(
    'WA 응답에 제출 원문이 실리지 않는다',
    !raw.includes('def solve'),
    `응답 길이 ${raw.length}자, source 길이 ${expectStrings.rows[0].source.length}자`,
  );

  const events = await stream.stop();
  record(
    '로그인 사용자의 채점 결과가 SSE 로 흘러온다',
    events.length >= 1,
    `수신 ${events.length}건: ${JSON.stringify(events.slice(0, 2))}`,
  );
  record(
    'SSE 이벤트에 기대값·원문이 없다',
    events.every((event) => !JSON.stringify(event).includes('def solve')),
    '',
  );

  await closePool();

  const failed = results.filter((item) => !item.ok);
  console.log(`\n종단 게이트 ${results.length}건 중 ${results.length - failed.length}건 통과.`);
  if (failed.length > 0) process.exitCode = 1;
}

await main();
