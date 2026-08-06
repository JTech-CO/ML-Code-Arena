/**
 * Postgres 연결 풀.
 *
 * 워커는 자기 풀을 갖는다. `apps/api` 와 코드를 공유하지 않는 것은 경계 규칙 때문이다
 * (docs/FILE_TREE.md §3) — 두 앱은 큐로만 통신하고 서로를 import 하지 않는다.
 * 공유되는 것은 `packages/shared` 의 타입·상수뿐이다.
 */

import pg from 'pg';

/** @type {pg.Pool|null} */
let pool = null;

/**
 * @param {string} [url]
 * @returns {pg.Pool}
 */
export function getPool(url) {
  if (pool) return pool;

  const connectionString = url ?? process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL 이 없다 (docs/ENVIRONMENT.md §3).');
  }

  pool = new pg.Pool({
    connectionString,
    // 동시성 4 + 여유. 풀이 동시성보다 작으면 워커가 자기 자신을 막는다.
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  return pool;
}

/** 풀을 닫는다. 테스트와 정상 종료에서 쓴다. */
export async function closePool() {
  if (!pool) return;
  const closing = pool;
  pool = null;
  await closing.end();
}

/**
 * 한 트랜잭션 안에서 실행한다. 실패하면 롤백한다.
 * @template T
 * @param {(client: pg.PoolClient) => Promise<T>} run
 * @returns {Promise<T>}
 */
export async function withTransaction(run) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
