/**
 * API 테스트 지원.
 *
 * `app.inject()` 를 쓰므로 네트워크 없이 라우트를 두드린다. 다만 **DB 와 Redis 는 진짜**다.
 * 익명 한도·빈도 제한·승계는 전부 저장소 동작에 얹혀 있어, 흉내 낸 저장소로 검증하면
 * 검증한 것이 우리 흉내이지 시스템이 아니다.
 *
 * 그래서 테스트 파일은 **직렬로** 돌아야 한다 (`--test-concurrency=1`). 같은 DB 를
 * 공유하므로 한 파일의 `resetDatabase()` 가 다른 파일이 방금 만든 행을 지운다.
 * 이 파일이 테스트로 오인되지 않도록 실행 대상은 `test/*.test.js` 로 명시한다 —
 * node 의 기본 탐색 패턴에는 `test/` 디렉터리의 모든 `.js` 가 들어간다.
 */

import { Redis } from 'ioredis';

import { createSessionStore } from '../src/auth/session.js';
import { closePool, getPool } from '../src/db/pool.js';
import { createRateLimiter } from '../src/rate-limit.js';
import { buildServer } from '../src/server.js';
import { createSubmissionStream } from '../src/sse/stream.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgres://mlca:mlca_dev@127.0.0.1:5432/mlca';
const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379';

export const TEST_CONFIG = Object.freeze({
  port: 3000,
  host: '127.0.0.1',
  nodeEnv: 'test',
  isProduction: false,
  databaseUrl: DATABASE_URL,
  redisUrl: REDIS_URL,
  sessionSecret: 'test-session-secret-aaaaaaaaaaaaaaaaaaaa',
  ipHashSecret: 'test-ip-hash-secret-bbbbbbbbbbbbbbbbbbbb',
  corsOrigins: ['http://localhost:5173'],
});

/** 저장소가 살아 있는지. 없으면 테스트를 건너뛴다. */
export async function storesAvailable() {
  try {
    await getPool(DATABASE_URL).query('SELECT 1');
    const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
    await redis.connect();
    await redis.quit();
    return true;
  } catch {
    return false;
  }
}

/**
 * 테스트 환경을 만든다. 큐만 가짜다 — 워커를 띄우지 않고 접수 경로를 보기 위해서다.
 * 큐에 실제로 들어가는지는 `tools/e2e-api.js` 가 워커까지 켜고 확인한다.
 */
export async function createHarness() {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  getPool(DATABASE_URL);

  /** @type {{ submission_id: string }[]} */
  const enqueued = [];
  const queue = /** @type {any} */ ({
    /**
     * @param {string} _name
     * @param {{ submission_id: string }} data
     */
    async add(_name, data) {
      enqueued.push(data);
      return { id: String(enqueued.length) };
    },
    async close() {},
  });

  const stream = createSubmissionStream({ databaseUrl: DATABASE_URL });

  const app = await buildServer({
    config: TEST_CONFIG,
    sessions: createSessionStore(redis),
    queue,
    rateLimiter: createRateLimiter(redis),
    stream,
    logger: false,
  });

  return {
    app,
    redis,
    stream,
    enqueued,
    async close() {
      await app.close();
      await stream.close();
      await redis.quit();
      await closePool();
    },
  };
}

/** 테스트 사이 상태를 지운다. 개발 DB 전용이다. */
export async function resetDatabase() {
  await getPool(DATABASE_URL).query(
    `TRUNCATE solved, submissions, anon_sessions, problem_tags, concept_problem_links,
              concepts, tags, problems, users RESTART IDENTITY CASCADE`,
  );
}

/** @param {Redis} redis */
export async function resetRateLimits(redis) {
  const keys = await redis.keys('rl:*');
  if (keys.length > 0) await redis.del(...keys);
}

/**
 * 문제 하나를 만든다.
 * @param {{ slug: string, published?: boolean }} input
 * @returns {Promise<string>} problem id
 */
export async function seedProblem(input) {
  const result = await getPool(DATABASE_URL).query(
    `INSERT INTO problems (slug, title, tier, difficulty, entrypoint, restrictions, is_published)
     VALUES ($1, $2, 1, 1, 'solve', $3, $4)
     RETURNING id`,
    [
      input.slug,
      `테스트 문제 ${input.slug}`,
      JSON.stringify({ allowed_imports: ['numpy'], required_entrypoint: 'solve' }),
      input.published ?? true,
    ],
  );
  return result.rows[0].id;
}

/**
 * 쿠키를 이어받는 최소 클라이언트. `inject` 는 쿠키를 자동으로 물고 가지 않는다.
 * @param {import('fastify').FastifyInstance} app
 */
export function createClient(app) {
  /** @type {Map<string, string>} */
  const jar = new Map();

  /**
   * @param {any} response
   * @returns {any}
   */
  function absorb(response) {
    for (const cookie of response.cookies ?? []) {
      const c = /** @type {{ name: string, value: string }} */ (cookie);
      if (c.value === '') jar.delete(c.name);
      else jar.set(c.name, c.value);
    }
    return response;
  }

  function cookieHeader() {
    return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  return {
    jar,
    /**
     * @param {{ method?: string, url: string, payload?: unknown, headers?: Record<string, string> }} options
     * @returns {Promise<any>}
     */
    async request(options) {
      /** @type {Record<string, string>} */
      const headers = { ...(options.headers ?? {}) };
      const cookies = cookieHeader();
      if (cookies) headers['cookie'] = cookies;

      /** @type {any} */
      const injectOptions = {
        method: options.method ?? 'GET',
        url: options.url,
        headers,
      };
      if (options.payload !== undefined) injectOptions.payload = options.payload;

      return absorb(await app.inject(injectOptions));
    },
    /**
     * 쿠키를 임의로 갈아끼운다. 위조 시나리오용.
     * @param {string} name
     * @param {string} value
     */
    setCookie(name, value) {
      jar.set(name, value);
    },
  };
}

/**
 * 워커가 결과를 쓴 것처럼 만든다. API 의 읽기 경로를 검증하기 위한 것이며,
 * 실제 채점 왕복은 `tools/e2e-api.js` 가 워커까지 켜고 확인한다.
 *
 * @param {{ id: string, verdict: string, detail?: unknown, failedCase?: number|null }} input
 */
export async function markJudged(input) {
  await getPool(DATABASE_URL).query(
    `UPDATE submissions
        SET status='DONE', verdict=$2, runtime_ms=12, memory_mb=48,
            failed_case_seq=$3, detail=$4, judged_at=now()
      WHERE id=$1`,
    [input.id, input.verdict, input.failedCase ?? null, input.detail ?? null],
  );
}
