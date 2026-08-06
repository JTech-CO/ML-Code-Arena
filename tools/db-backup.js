/**
 * DB 백업과 **복구 검증** (docs/TECHNICAL.md §13.3, M7 DoD 7).
 *
 *   node --env-file-if-exists=.env tools/db-backup.js
 *   node --env-file-if-exists=.env tools/db-backup.js --verify
 *   node --env-file-if-exists=.env tools/db-backup.js --verify --file <경로>
 *
 * **덤프를 만드는 것은 백업이 아니다.** 복구되는 덤프만 백업이다. `--verify` 는 덤프를
 * 빈 데이터베이스에 실제로 복원하고 행 수를 대조한 뒤 그 데이터베이스를 지운다.
 * 이 확인 없이 매일 도는 크론은 "복구 안 되는 파일을 매일 만드는 크론"일 수 있고,
 * 그 사실은 복구가 필요한 날 처음 드러난다.
 *
 * 호스트에 `pg_dump` 를 요구하지 않는다. Postgres 컨테이너 안의 것을 쓰고 표준출력으로
 * 받는다 — 클라이언트와 서버의 버전이 어긋날 수 없다.
 */

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

/** 보존 기간. 일 1회 기준 30개면 한 달이다. */
const KEEP = 30;

/** 복구 검증용 임시 데이터베이스. 검증이 끝나면 지운다. */
const SCRATCH_DB = 'mlca_restore_check';

const USAGE = `사용법:
  node tools/db-backup.js [옵션]

옵션:
  --dir <경로>       백업 디렉터리 (기본 $BACKUP_DIR 또는 ./backup)
  --service <이름>   Postgres 컨테이너 서비스명 (기본 postgres)
  --compose <파일>   compose 파일 (기본 deploy/compose.yml, 없으면 docker-compose.yml)
  --verify           덤프를 빈 DB 에 복원해 대조한다. 복원 후 그 DB 는 지운다
  --file <경로>      --verify 대상 덤프. 생략하면 방금 만든 것
  --keep <수>        보존 개수 (기본 30)
  --no-dump          덤프하지 않고 --file 만 검증한다`;

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
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[token.slice(2)] = next;
      index += 1;
    } else {
      flags[token.slice(2)] = true;
    }
  }
  return flags;
}

/**
 * `docker compose exec -T` 를 돌린다.
 * @param {{ compose: string, service: string, argv: string[] }} target
 * @param {{ stdout?: NodeJS.WritableStream, stdin?: string }} [io]
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function composeExec(target, io = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      ['compose', '-f', target.compose, 'exec', '-T', target.service, ...target.argv],
      { stdio: ['pipe', io.stdout ? 'pipe' : 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';

    if (io.stdout) {
      // 파이프를 그대로 잇는다. 덤프를 메모리에 올리지 않는다.
      child.stdout.pipe(io.stdout);
    } else {
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
    }
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));

    if (io.stdin !== undefined) child.stdin.end(io.stdin);
    else child.stdin.end();
  });
}

/**
 * 파이프로 이어 받는 실행. 덤프처럼 큰 출력을 파일로 흘릴 때 쓴다.
 * @param {{ compose: string, service: string, argv: string[] }} target
 * @param {string} outPath
 */
async function composeExecToFile(target, outPath) {
  const child = spawn(
    'docker',
    ['compose', '-f', target.compose, 'exec', '-T', target.service, ...target.argv],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const exited = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });

  await pipeline(child.stdout, createGzip({ level: 6 }), createWriteStream(outPath));
  const code = await exited;

  if (code !== 0) throw new Error(`pg_dump 실패 (exit=${code})\n${stderr.trim()}`);
  return stderr;
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
 * `--verify` — 덤프를 빈 DB 에 복원하고 대조한다.
 *
 * 대조 대상은 **테이블 목록과 행 수**다. 덤프가 열리는 것만 보면 스키마만 있고
 * 데이터가 빠진 덤프도 통과한다.
 *
 * @param {{ compose: string, service: string, user: string, db: string }} target
 * @param {string} dumpPath
 */
async function verifyRestore(target, dumpPath) {
  /** @param {string} database */
  const counts = async (database) => {
    const result = await composeExec({
      compose: target.compose,
      service: target.service,
      argv: [
        'psql',
        '-U',
        target.user,
        '-d',
        database,
        '-t',
        '-A',
        '-F',
        '\t',
        '-c',
        `SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname`,
      ],
    });
    if (result.code !== 0) throw new Error(`행 수 조회 실패: ${result.stderr.trim()}`);
    /** @type {Record<string, number>} */
    const table = {};
    for (const line of result.stdout.split('\n')) {
      const [name, n] = line.trim().split('\t');
      if (name) table[name] = Number.parseInt(n ?? '0', 10);
    }
    return table;
  };

  /** @param {string} sql */
  const admin = async (sql) => {
    const result = await composeExec({
      compose: target.compose,
      service: target.service,
      argv: ['psql', '-U', target.user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    });
    if (result.code !== 0) throw new Error(`${sql} 실패: ${result.stderr.trim()}`);
  };

  // 통계가 오래됐으면 n_live_tup 이 실제와 어긋난다. 대조 전에 갱신한다.
  await composeExec({
    compose: target.compose,
    service: target.service,
    argv: ['psql', '-U', target.user, '-d', target.db, '-c', 'ANALYZE'],
  });
  const before = await counts(target.db);

  await admin(`DROP DATABASE IF EXISTS ${SCRATCH_DB}`);
  await admin(`CREATE DATABASE ${SCRATCH_DB}`);

  try {
    // gunzip → psql. 덤프를 호스트에서 풀어 컨테이너 표준입력으로 넣는다.
    const restore = spawn(
      'docker',
      [
        'compose',
        '-f',
        target.compose,
        'exec',
        '-T',
        target.service,
        'psql',
        '-U',
        target.user,
        '-d',
        SCRATCH_DB,
        '-v',
        'ON_ERROR_STOP=1',
        '-q',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );

    let restoreErr = '';
    restore.stderr.on('data', (chunk) => {
      restoreErr += chunk;
    });
    restore.stdout.resume();

    const { createReadStream } = await import('node:fs');
    const { createGunzip } = await import('node:zlib');

    const exited = new Promise((resolve, reject) => {
      restore.on('error', reject);
      restore.on('close', (code) => resolve(code ?? 1));
    });

    await pipeline(createReadStream(dumpPath), createGunzip(), restore.stdin);
    const code = await exited;
    if (code !== 0) throw new Error(`복원 실패 (exit=${code})\n${restoreErr.trim().slice(0, 800)}`);

    await composeExec({
      compose: target.compose,
      service: target.service,
      argv: ['psql', '-U', target.user, '-d', SCRATCH_DB, '-c', 'ANALYZE'],
    });
    const after = await counts(SCRATCH_DB);

    /** @type {string[]} */
    const mismatches = [];
    for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const left = before[name] ?? -1;
      const right = after[name] ?? -1;
      if (left !== right) mismatches.push(`${name}: 원본 ${left} · 복원 ${right}`);
    }

    return { before, after, mismatches };
  } finally {
    // 검증용 DB 를 남기지 않는다. 남으면 다음 검증이 "이미 있다"로 실패하거나,
    // 더 나쁘게는 누군가 그것을 운영 DB 로 착각한다.
    await admin(`DROP DATABASE IF EXISTS ${SCRATCH_DB}`);
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags['help']) {
    console.log(USAGE);
    return;
  }

  const composeFlag = typeof flags['compose'] === 'string' ? flags['compose'] : null;
  const compose =
    composeFlag ?? ((await exists('deploy/compose.yml')) ? 'deploy/compose.yml' : 'docker-compose.yml');
  const service = typeof flags['service'] === 'string' ? flags['service'] : 'postgres';

  const user = process.env['POSTGRES_USER'] ?? 'mlca';
  const db = process.env['POSTGRES_DB'] ?? 'mlca';

  const dir = path.resolve(
    typeof flags['dir'] === 'string' ? flags['dir'] : (process.env['BACKUP_DIR'] ?? 'backup'),
  );
  await mkdir(dir, { recursive: true });

  /** @type {string|null} */
  let dumpPath = typeof flags['file'] === 'string' ? path.resolve(flags['file']) : null;

  if (!flags['no-dump']) {
    // 파일명은 정렬 가능한 UTC 시각이다. 로케일에 기대지 않는다.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    dumpPath = path.join(dir, `mlca-${stamp}.sql.gz`);

    await composeExecToFile(
      {
        compose,
        service,
        // `--clean --if-exists` 를 넣어 덤프 자체가 복원 전 정리를 한다. 복원 대상이
        // 빈 DB 가 아닐 때도 같은 결과가 나와야 한다.
        argv: ['pg_dump', '-U', user, '-d', db, '--clean', '--if-exists', '--no-owner'],
      },
      dumpPath,
    );

    const size = (await stat(dumpPath)).size;
    console.log(`덤프  ${path.basename(dumpPath)}  ${(size / 1024).toFixed(1)}KB`);

    if (size < 1024) {
      console.error('덤프가 1KB 미만이다 — 내용이 비었을 가능성이 높다');
      process.exitCode = 1;
      return;
    }

    // 오래된 것부터 지운다.
    const keep = Number.parseInt(String(flags['keep'] ?? KEEP), 10) || KEEP;
    const files = (await readdir(dir))
      .filter((name) => /^mlca-.*\.sql\.gz$/.test(name))
      .sort()
      .reverse();
    for (const stale of files.slice(keep)) {
      await rm(path.join(dir, stale));
      console.log(`정리  ${stale}`);
    }
    console.log(`보존  ${Math.min(files.length, keep)}/${keep}개`);
  }

  if (flags['verify']) {
    if (!dumpPath) {
      console.error('--verify 에 대상이 없다. --file 을 주거나 --no-dump 를 빼라.');
      process.exitCode = 2;
      return;
    }

    console.log('');
    console.log(`복구 검증  ${path.basename(dumpPath)} → ${SCRATCH_DB}`);
    const result = await verifyRestore({ compose, service, user, db }, dumpPath);

    const tables = Object.keys(result.after).length;
    const rows = Object.values(result.after).reduce((sum, n) => sum + n, 0);

    if (result.mismatches.length > 0) {
      console.error(`행 수가 다르다 (${result.mismatches.length}건)`);
      for (const line of result.mismatches) console.error(`  ${line}`);
      process.exitCode = 1;
      return;
    }

    console.log(`복구 성공  테이블 ${tables}개 · 행 ${rows}개 일치`);
    for (const [name, n] of Object.entries(result.after).sort()) {
      if (n > 0) console.log(`    ${String(n).padStart(6)}  ${name}`);
    }
  }
}

await main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
