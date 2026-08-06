/**
 * 마이그레이션 러너 (ADR-0008).
 *
 *   node tools/migrate.js up          대기 중인 마이그레이션 전부 적용
 *   node tools/migrate.js down        마지막 1건 되돌림
 *   node tools/migrate.js status      적용 상태 표
 *   node tools/migrate.js reset       전부 되돌린 뒤 다시 적용
 *
 * 각 마이그레이션은 **단일 트랜잭션**으로 돈다. 중간에 실패하면 그 마이그레이션은
 * 통째로 롤백되고 이력에도 남지 않는다. 반쯤 적용된 스키마가 남으면 다음 실행이
 * 무엇을 해야 할지 알 수 없다.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');

const HISTORY_TABLE = `
  CREATE TABLE IF NOT EXISTS _migrations (
    id         text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

/**
 * @typedef {object} Migration
 * @property {string} id `0001_judging_core`
 * @property {string} upPath
 * @property {string} downPath
 */

/** @returns {Promise<Migration[]>} */
async function discover() {
  const entries = await readdir(MIGRATIONS_DIR);
  const ids = [
    ...new Set(
      entries
        .filter((name) => name.endsWith('.up.sql'))
        .map((name) => name.replace(/\.up\.sql$/, '')),
    ),
  ].sort();

  return ids.map((id) => ({
    id,
    upPath: path.join(MIGRATIONS_DIR, `${id}.up.sql`),
    downPath: path.join(MIGRATIONS_DIR, `${id}.down.sql`),
  }));
}

/**
 * @param {pg.Client} client
 * @returns {Promise<string[]>}
 */
async function applied(client) {
  const result = await client.query('SELECT id FROM _migrations ORDER BY id');
  return result.rows.map((/** @type {{ id: string }} */ row) => row.id);
}

/**
 * @param {pg.Client} client
 * @param {Migration} migration
 * @param {'up'|'down'} direction
 */
async function run(client, migration, direction) {
  const file = direction === 'up' ? migration.upPath : migration.downPath;
  const sql = await readFile(file, 'utf8');

  await client.query('BEGIN');
  try {
    await client.query(sql);
    if (direction === 'up') {
      await client.query('INSERT INTO _migrations (id) VALUES ($1)', [migration.id]);
    } else {
      await client.query('DELETE FROM _migrations WHERE id = $1', [migration.id]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`${migration.id} ${direction} 실패: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }

  console.log(`  ${direction === 'up' ? '적용' : '되돌림'}  ${migration.id}`);
}

async function main() {
  const command = process.argv[2] ?? 'status';
  const url = process.env['DATABASE_URL'];

  if (!url) {
    console.error('DATABASE_URL 이 없다. .env 를 확인할 것 (docs/ENVIRONMENT.md §3).');
    process.exitCode = 2;
    return;
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await client.query(HISTORY_TABLE);

    const migrations = await discover();
    const done = new Set(await applied(client));

    if (command === 'status') {
      console.log('마이그레이션 상태');
      for (const migration of migrations) {
        console.log(`  ${done.has(migration.id) ? '적용됨  ' : '대기    '}${migration.id}`);
      }
      console.log(`  ${done.size}/${migrations.length} 적용됨`);
      return;
    }

    if (command === 'up' || command === 'reset') {
      if (command === 'reset') {
        for (const migration of [...migrations].reverse()) {
          if (done.has(migration.id)) await run(client, migration, 'down');
        }
        done.clear();
      }

      const pending = migrations.filter((migration) => !done.has(migration.id));
      if (pending.length === 0) {
        console.log('대기 중인 마이그레이션 없음');
        return;
      }
      for (const migration of pending) await run(client, migration, 'up');
      return;
    }

    if (command === 'down') {
      const last = [...migrations].reverse().find((migration) => done.has(migration.id));
      if (!last) {
        console.log('되돌릴 마이그레이션 없음');
        return;
      }
      await run(client, last, 'down');
      return;
    }

    console.error(`알 수 없는 명령: ${command}`);
    console.error('사용법: node tools/migrate.js <up|down|status|reset>');
    process.exitCode = 2;
  } finally {
    await client.end();
  }
}

await main();
