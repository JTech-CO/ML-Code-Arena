/** 인증·익명 세션·계정 승계 (M3 DoD 6·9·10). */

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { hmac } from '../src/auth/ip.js';
import { hashPassword, isArgon2id, verifyPassword } from '../src/auth/password.js';
import { getPool } from '../src/db/pool.js';


import {
  TEST_CONFIG,
  createClient,
  createHarness,
  markJudged,
  resetDatabase,
  resetRateLimits,
  seedProblem,
  storesAvailable,
} from './helpers.js';

const available = await storesAvailable();

describe('인증 · 익명 세션 · 승계', { skip: available ? false : 'Postgres/Redis 미기동' }, () => {
  /** @type {Awaited<ReturnType<typeof createHarness>>} */
  let harness;

  before(async () => {
    harness = await createHarness();
  });
  after(async () => {
    await harness.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    await resetRateLimits(harness.redis);
  });

  // --- DoD 9 ---------------------------------------------------------------

  test('비밀번호가 argon2id 로 해시된다', async () => {
    const hash = await hashPassword('correct horse battery');
    assert.ok(isArgon2id(hash), `argon2id 가 아니다: ${hash.slice(0, 20)}`);
    assert.ok(await verifyPassword(hash, 'correct horse battery'));
    assert.equal(await verifyPassword(hash, '틀린 비밀번호'), false);
  });

  test('같은 비밀번호도 매번 다른 해시가 된다 — 솔트가 붙는다', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    assert.notEqual(a, b);
  });

  test('DB 에 평문·약한 해시가 남지 않는다', async () => {
    const client = createClient(harness.app);
    await client.request({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'a@example.com', handle: 'alpha', password: 'password123' },
    });

    const row = await getPool().query('SELECT password_hash FROM users');
    const stored = row.rows[0].password_hash;
    assert.ok(isArgon2id(stored), stored.slice(0, 24));
    assert.ok(!stored.includes('password123'), '평문이 저장됐다');
  });

  // --- DoD 10 --------------------------------------------------------------

  test('IP 는 원본이 아니라 HMAC 해시로만 저장된다', async () => {
    const client = createClient(harness.app);
    const problemSlug = 'ip-hash-check';
    await seedProblem({ slug: problemSlug });

    await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: problemSlug, language: 'python', source: 'def solve(x): return x' },
    });

    const row = await getPool().query('SELECT ip_hash, ua_hash FROM anon_sessions');
    assert.equal(row.rowCount, 1);

    const ipHash = row.rows[0].ip_hash;
    assert.ok(Buffer.isBuffer(ipHash));
    assert.equal(ipHash.length, 32, 'SHA-256 이 아니다');

    // 원본 IP 문자열이 저장돼 있지 않다.
    assert.ok(!ipHash.toString('utf8').includes('127.0.0.1'));
    // 그리고 우리가 만든 해시와 일치한다 — 무작위 값이 아니라 진짜 HMAC 이다.
    const expected = hmac(TEST_CONFIG.ipHashSecret, '127.0.0.1');
    assert.ok(ipHash.equals(expected), 'IP_HASH_SECRET 으로 만든 HMAC 이 아니다');
  });

  test('IP 해시와 세션 시크릿이 서로 다른 키를 쓴다', async () => {
    // 같은 키면 세션이 유출될 때 IP 해시가 함께 역산 가능해진다.
    assert.notEqual(
      hmac(TEST_CONFIG.ipHashSecret, '1.2.3.4').toString('hex'),
      hmac(TEST_CONFIG.sessionSecret, '1.2.3.4').toString('hex'),
    );
  });

  // --- 가입·로그인 ---------------------------------------------------------

  test('가입 후 로그인 세션이 발급된다', async () => {
    const client = createClient(harness.app);
    const registered = await client.request({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'b@example.com', handle: 'bravo', password: 'password123' },
    });
    assert.equal(registered.statusCode, 201);

    const me = await client.request({ url: '/api/auth/me' });
    assert.equal(me.json().authenticated, true);
    assert.equal(me.json().user.handle, 'bravo');
  });

  test('로그아웃하면 세션이 무효화된다', async () => {
    const client = createClient(harness.app);
    await client.request({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'c@example.com', handle: 'charlie', password: 'password123' },
    });
    await client.request({ method: 'POST', url: '/api/auth/logout' });

    const me = await client.request({ url: '/api/auth/me' });
    assert.equal(me.json().authenticated, false);
  });

  test('잘못된 비밀번호와 없는 계정이 같은 응답을 준다', async () => {
    const client = createClient(harness.app);
    await client.request({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'd@example.com', handle: 'delta', password: 'password123' },
    });

    const wrongPassword = await client.request({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'd@example.com', password: 'nope-nope-nope' },
    });
    const noAccount = await client.request({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ghost@example.com', password: 'nope-nope-nope' },
    });

    // 계정 존재 여부가 응답으로 드러나면 안 된다.
    assert.equal(wrongPassword.statusCode, 401);
    assert.equal(noAccount.statusCode, 401);
    assert.deepEqual(wrongPassword.json(), noAccount.json());
  });

  test('응답 어디에도 비밀번호 해시가 실리지 않는다', async () => {
    const client = createClient(harness.app);
    const registered = await client.request({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'e@example.com', handle: 'echo', password: 'password123' },
    });
    const me = await client.request({ url: '/api/auth/me' });

    for (const body of [registered.body, me.body]) {
      assert.ok(!body.includes('argon2'), '해시가 응답에 실렸다');
      assert.ok(!body.includes('password'), '비밀번호 관련 필드가 응답에 실렸다');
    }
  });

  // --- DoD 6 계정 승계 -----------------------------------------------------

  test('로그인 시 익명 제출 이력이 계정으로 승계되고 solved 가 채워진다', async () => {
    const client = createClient(harness.app);
    const slugA = 'merge-a';
    const slugB = 'merge-b';
    await seedProblem({ slug: slugA });
    await seedProblem({ slug: slugB });

    // 익명으로 두 문제 제출, 하나는 AC 로 채점됐다고 표시
    const first = await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: slugA, language: 'python', source: 'def solve(x): return x' },
    });
    const second = await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: slugB, language: 'python', source: 'def solve(x): return x' },
    });
    await markJudged({ id: first.json().submission_id, verdict: 'AC' });
    await markJudged({ id: second.json().submission_id, verdict: 'WA' });

    const anonCount = await getPool().query(
      `SELECT count(*)::int AS n FROM submissions WHERE anon_session_id IS NOT NULL`,
    );
    assert.equal(anonCount.rows[0].n, 2, '익명 제출이 2건이어야 한다');

    // 가입 → 승계
    const registered = await client.request({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'f@example.com', handle: 'foxtrot', password: 'password123' },
    });
    assert.equal(registered.json().merged.movedSubmissions, 2);

    const moved = await getPool().query(
      `SELECT count(*) FILTER (WHERE user_id IS NOT NULL)::int AS owned,
              count(*) FILTER (WHERE anon_session_id IS NOT NULL)::int AS orphan
         FROM submissions`,
    );
    assert.equal(moved.rows[0].owned, 2, '제출이 계정으로 옮겨지지 않았다');
    assert.equal(moved.rows[0].orphan, 0, '익명 소유가 남아 있다');

    // solved 는 AC 한 건만
    const solved = await getPool().query(`SELECT problem_id FROM solved`);
    assert.equal(solved.rowCount, 1, 'AC 가 아닌 제출까지 solved 에 들어갔다');

    const ranking = await client.request({ url: '/api/ranking' });
    assert.equal(ranking.json().ranking[0].handle, 'foxtrot');
    assert.equal(ranking.json().ranking[0].solved_count, 1);
  });

  test('승계는 두 번 실행해도 결과가 같다', async () => {
    const client = createClient(harness.app);
    await seedProblem({ slug: 'merge-idem' });

    const submitted = await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: 'merge-idem', language: 'python', source: 'def solve(x): return x' },
    });
    await markJudged({ id: submitted.json().submission_id, verdict: 'AC' });

    const anonCookie = client.jar.get('mlca_anon');

    await client.request({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'g@example.com', handle: 'golf', password: 'password123' },
    });

    // 익명 쿠키를 되살려 다시 로그인 — 이미 승계된 세션은 다시 옮기지 않는다.
    await client.request({ method: 'POST', url: '/api/auth/logout' });
    if (anonCookie) client.setCookie('mlca_anon', anonCookie);

    const again = await client.request({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'g@example.com', password: 'password123' },
    });
    assert.equal(again.json().merged.movedSubmissions, 0, '이미 승계된 세션을 다시 옮겼다');

    const solved = await getPool().query(`SELECT count(*)::int AS n FROM solved`);
    assert.equal(solved.rows[0].n, 1);
  });
});
