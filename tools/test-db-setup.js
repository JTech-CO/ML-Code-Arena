/**
 * 테스트 전용 데이터베이스를 준비한다.
 *
 *   node --env-file-if-exists=.env tools/test-db-setup.js
 *
 * **왜 이것이 M7 에 있는가.** API 테스트는 진짜 DB 를 쓰고 매 테스트 사이에 `TRUNCATE`
 * 한다. 지금까지 그 대상이 개발 DB 였고, 실제로 M6 작업 중 두 번 문제 30개가 날아갔다.
 * 개발에서는 재적재로 끝나지만, **운영 호스트에 `.env` 를 둔 채 `pnpm test` 를 한 번
 * 돌리면 운영 데이터가 사라진다.** 운영 phase 에서 남겨 둘 수 있는 종류의 함정이 아니다.
 *
 * 대상 DB 는 `TEST_DATABASE_URL`, 없으면 `DATABASE_URL` 의 이름에 `_test` 를 붙인 것이다.
 * 이름이 `_test` 로 끝나지 않으면 테스트가 **거부**한다 (apps/api/test/helpers.js).
 * 건너뛰지 않고 거부하는 이유는, 건너뛰면 아무도 모르는 채로 통과하기 때문이다.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * `postgres://u:p@h:5432/mlca` → `postgres://u:p@h:5432/mlca_test`
 *
 * @param {string} url
 * @returns {string}
 */
export function toTestUrl(url) {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, '');
  if (!name) throw new Error(`DATABASE_URL 에 데이터베이스 이름이 없다: ${url}`);
  parsed.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
  return parsed.toString();
}

/** @param {string} url */
function databaseName(url) {
  return new URL(url).pathname.replace(/^\//, '');
}

/**
 * 유지보수 DB(`postgres`)에 붙어 대상 DB 를 만든다.
 * @param {string} testUrl
 * @returns {Promise<boolean>} 새로 만들었으면 true
 */
async function ensureDatabase(testUrl) {
  const admin = new URL(testUrl);
  admin.pathname = '/postgres';

  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();

  try {
    const name = databaseName(testUrl);
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (found.rowCount && found.rowCount > 0) return false;

    // 식별자는 바인딩할 수 없다. 이름이 우리가 만든 것인지 형태로 확인한다.
    if (!/^[a-z0-9_]+_test$/.test(name)) {
      throw new Error(`테스트 DB 이름이 규약을 벗어난다: ${name}`);
    }
    await client.query(`CREATE DATABASE ${name}`);
    return true;
  } finally {
    await client.end();
  }
}

/**
 * @param {string} testUrl
 * @returns {Promise<number>}
 */
function migrate(testUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(ROOT, 'tools', 'migrate.js'), 'up', '--url', testUrl],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const applied = out.split('\n').filter((line) => line.includes('적용 ')).length;
      resolve(code === 0 ? applied : -1);
    });
  });
}

async function main() {
  const base = process.env['DATABASE_URL'];
  if (!base) {
    // DB 없이 도는 환경(포크 CI 등)에서는 조용히 넘어간다. 테스트 쪽이 저장소 부재를
    // 감지해 건너뛴다.
    console.log('테스트 DB 준비 건너뜀 — DATABASE_URL 없음');
    return;
  }

  const testUrl = process.env['TEST_DATABASE_URL'] ?? toTestUrl(base);

  if (databaseName(testUrl) === databaseName(base)) {
    console.error('TEST_DATABASE_URL 이 DATABASE_URL 과 같은 DB 를 가리킨다.');
    console.error('테스트는 매번 TRUNCATE 한다 — 같은 DB 를 쓰면 데이터가 사라진다.');
    process.exitCode = 1;
    return;
  }

  let created = false;
  try {
    created = await ensureDatabase(testUrl);
  } catch (error) {
    console.log(`테스트 DB 준비 건너뜀 — ${String(error).split('\n')[0]}`);
    return;
  }

  const applied = await migrate(testUrl);
  if (applied < 0) {
    console.error('테스트 DB 마이그레이션 실패');
    process.exitCode = 1;
    return;
  }

  console.log(
    `테스트 DB ${databaseName(testUrl)} ${created ? '생성' : '확인'}` +
      (applied > 0 ? ` · 마이그레이션 ${applied}건 적용` : ''),
  );
}

await main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
