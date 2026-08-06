/**
 * Postgres 연결 풀.
 *
 * `apps/worker` 와 코드를 공유하지 않는다. 두 앱은 큐로만 통신하고 서로를 import 하지
 * 않는다 (docs/FILE_TREE.md §3, INV-3). 공유되는 것은 `packages/shared` 의 타입·상수뿐이다.
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
  if (!connectionString) throw new Error('DATABASE_URL 이 없다 (docs/ENVIRONMENT.md §3).');

  pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  return pool;
}

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
