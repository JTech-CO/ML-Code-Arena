/** 제출 접수·익명 한도·빈도 제한·기대값 비노출 (M3 DoD 2·3·4·5·7·8). */

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { ANON_PROBLEM_LIMIT, SOURCE_MAX_BYTES } from '@mlca/shared';

import { getPool } from '../src/db/pool.js';
import { sanitizeDetail } from '../src/serialize.js';

import {
  createClient,
  createHarness,
  markJudged,
  resetDatabase,
  resetRateLimits,
  seedProblem,
  storesAvailable,
} from './helpers.js';

const available = await storesAvailable();
const SOURCE = 'import numpy as np\ndef solve(x):\n    return x\n';

describe('제출 접수 · 한도 · 비노출', { skip: available ? false : 'Postgres/Redis 미기동' }, () => {
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
    harness.enqueued.length = 0;
  });

  // --- DoD 2 ---------------------------------------------------------------

  test('제출이 202 와 submission_id · queue_position 을 돌려준다', async () => {
    const client = createClient(harness.app);
    await seedProblem({ slug: 'accept' });

    const response = await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: 'accept', language: 'python', source: SOURCE },
    });

    assert.equal(response.statusCode, 202);
    const body = response.json();
    assert.ok(body.submission_id, 'submission_id 가 없다');
    assert.equal(body.status, 'PENDING');
    assert.equal(typeof body.queue_position, 'number');
    assert.ok(body.queue_position >= 1);

    // 큐에 실린 것은 제출 ID 하나다.
    assert.deepEqual(harness.enqueued, [{ submission_id: body.submission_id }]);
  });

  test('채점 완료 후 조회가 판정을 돌려준다', async () => {
    const client = createClient(harness.app);
    await seedProblem({ slug: 'judged' });

    const submitted = await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: 'judged', language: 'python', source: SOURCE },
    });
    const id = submitted.json().submission_id;

    const pending = await client.request({ url: `/api/submissions/${id}` });
    assert.equal(pending.json().status, 'PENDING');
    assert.equal(pending.json().verdict, null);

    await markJudged({
      id,
      verdict: 'WA',
      failedCase: 1,
      detail: { reason: 'shape_mismatch', expected_shape: [3, 3], actual_shape: [9] },
    });

    const done = await client.request({ url: `/api/submissions/${id}` });
    assert.equal(done.json().status, 'DONE');
    assert.equal(done.json().verdict, 'WA');
    assert.equal(done.json().failed_case_seq, 1);
    assert.deepEqual(done.json().detail.expected_shape, [3, 3]);
  });

  test('없는 문제·미공개 문제는 404 다', async () => {
    const client = createClient(harness.app);
    await seedProblem({ slug: 'hidden', published: false });

    for (const slug of ['does-not-exist', 'hidden']) {
      const response = await client.request({
        method: 'POST',
        url: '/api/submissions',
        payload: { problem_slug: slug, language: 'python', source: SOURCE },
      });
      assert.equal(response.statusCode, 404, slug);
      assert.equal(response.json().code, 'PROBLEM_NOT_FOUND');
    }
  });

  test('64KB 를 넘는 소스는 400 SOURCE_TOO_LARGE 다', async () => {
    const client = createClient(harness.app);
    await seedProblem({ slug: 'too-large' });

    const response = await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: {
        problem_slug: 'too-large',
        language: 'python',
        source: 'x'.repeat(SOURCE_MAX_BYTES + 1),
      },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, 'SOURCE_TOO_LARGE');
  });

  // --- DoD 3 (INV-5) -------------------------------------------------------

  test('WA 응답에 기대값이 실리지 않는다', async () => {
    const client = createClient(harness.app);
    await seedProblem({ slug: 'no-leak' });

    const submitted = await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: 'no-leak', language: 'python', source: SOURCE },
    });
    const id = submitted.json().submission_id;

    // 워커가 실수로 기대값을 detail 에 넣었다고 가정한다.
    // 화이트리스트가 통과 목록이므로 알려지지 않은 키는 나가지 않아야 한다.
    await markJudged({
      id,
      verdict: 'WA',
      failedCase: 0,
      detail: {
        reason: 'value_mismatch',
        expected_shape: [2, 2],
        expected_value: [[0.577350269, 0.816496581]],
        expect: 'SECRET-EXPECTED-VALUE',
        answer: 42.123456789,
      },
    });

    const response = await client.request({ url: `/api/submissions/${id}` });
    const body = response.body;

    for (const leak of ['SECRET-EXPECTED-VALUE', '0.577350269', '42.123456789', 'expected_value', 'answer']) {
      assert.ok(!body.includes(leak), `기대값이 응답에 실렸다: ${leak}`);
    }
    // 노출해도 되는 것은 남아 있다.
    assert.deepEqual(response.json().detail.expected_shape, [2, 2]);
    assert.equal(response.json().detail.reason, 'value_mismatch');
  });

  test('제출 원문은 어떤 응답에도 실리지 않는다', async () => {
    const client = createClient(harness.app);
    await seedProblem({ slug: 'no-source' });
    const marker = '# UNIQUE-SOURCE-MARKER-9f2a';

    const submitted = await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: 'no-source', language: 'python', source: `${SOURCE}${marker}` },
    });
    const id = submitted.json().submission_id;
    await markJudged({ id, verdict: 'AC' });

    for (const url of [`/api/submissions/${id}`, '/api/submissions']) {
      const response = await client.request({ url });
      assert.ok(!response.body.includes(marker), `${url} 에 제출 원문이 실렸다`);
    }
  });

  test('sanitizeDetail 이 모르는 키를 통과시키지 않는다', () => {
    const out = sanitizeDetail({
      reason: 'shape_mismatch',
      expected_shape: [1],
      expected_values: [1, 2, 3],
      secret: 'x',
      violations: [{ rule: 'r', message: 'm', line: 1, extra: 'nope' }],
    });
    assert.deepEqual(Object.keys(out ?? {}).sort(), ['expected_shape', 'reason', 'violations']);

    const violations = /** @type {{ rule: string, message: string, line: number }[]} */ (
      out?.['violations']
    );
    assert.deepEqual(Object.keys(violations[0] ?? {}).sort(), ['line', 'message', 'rule']);
  });

  // --- DoD 4 ---------------------------------------------------------------

  test(`익명은 고유 문제 ${ANON_PROBLEM_LIMIT}개까지 제출하고 그다음은 403 이다`, async () => {
    const client = createClient(harness.app);
    for (let i = 0; i < ANON_PROBLEM_LIMIT + 1; i += 1) {
      await seedProblem({ slug: `anon-${i}` });
    }

    for (let i = 0; i < ANON_PROBLEM_LIMIT; i += 1) {
      await resetRateLimits(harness.redis);
      const response = await client.request({
        method: 'POST',
        url: '/api/submissions',
        payload: { problem_slug: `anon-${i}`, language: 'python', source: SOURCE },
      });
      assert.equal(response.statusCode, 202, `${i + 1}번째 문제가 거부됐다`);
    }

    await resetRateLimits(harness.redis);
    const blocked = await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: `anon-${ANON_PROBLEM_LIMIT}`, language: 'python', source: SOURCE },
    });
    assert.equal(blocked.statusCode, 403);
    assert.equal(blocked.json().code, 'ANON_LIMIT_REACHED');
  });

  test('같은 문제 반복 제출은 한도를 소진하지 않는다', async () => {
    const client = createClient(harness.app);
    await seedProblem({ slug: 'repeat' });
    await seedProblem({ slug: 'other' });

    // 같은 문제에 여러 번
    for (let i = 0; i < 5; i += 1) {
      await resetRateLimits(harness.redis);
      const response = await client.request({
        method: 'POST',
        url: '/api/submissions',
        payload: { problem_slug: 'repeat', language: 'python', source: SOURCE },
      });
      assert.equal(response.statusCode, 202);
    }

    const me = await client.request({ url: '/api/auth/me' });
    assert.equal(me.json().anonymous.solved_count, 1, '제출 횟수가 아니라 고유 문제 수여야 한다');
    assert.equal(me.json().anonymous.remaining, ANON_PROBLEM_LIMIT - 1);
  });

  // --- DoD 5 (INV-9) -------------------------------------------------------

  test('본문·헤더로 보낸 카운트는 무시된다', async () => {
    const client = createClient(harness.app);
    for (let i = 0; i < ANON_PROBLEM_LIMIT + 1; i += 1) await seedProblem({ slug: `forge-${i}` });

    for (let i = 0; i < ANON_PROBLEM_LIMIT; i += 1) {
      await resetRateLimits(harness.redis);
      await client.request({
        method: 'POST',
        url: '/api/submissions',
        payload: { problem_slug: `forge-${i}`, language: 'python', source: SOURCE },
      });
    }

    await resetRateLimits(harness.redis);
    const blocked = await client.request({
      method: 'POST',
      url: '/api/submissions',
      headers: { 'x-anon-solved-count': '0', 'x-mlca-solved': '0' },
      payload: {
        problem_slug: `forge-${ANON_PROBLEM_LIMIT}`,
        language: 'python',
        source: SOURCE,
        solved_count: 0,
        anon_session_id: '00000000-0000-0000-0000-000000000000',
      },
    });
    assert.equal(blocked.statusCode, 403, '클라이언트 값으로 한도를 우회했다');
  });

  test('카운터 컬럼을 조작해도 한도가 풀리지 않는다', async () => {
    // solved_count 는 표시용 캐시일 뿐이고 판단은 제출 이력에서 센다.
    const client = createClient(harness.app);
    for (let i = 0; i < ANON_PROBLEM_LIMIT + 1; i += 1) await seedProblem({ slug: `cache-${i}` });

    for (let i = 0; i < ANON_PROBLEM_LIMIT; i += 1) {
      await resetRateLimits(harness.redis);
      await client.request({
        method: 'POST',
        url: '/api/submissions',
        payload: { problem_slug: `cache-${i}`, language: 'python', source: SOURCE },
      });
    }

    await getPool().query(`UPDATE anon_sessions SET solved_count = 0`);

    await resetRateLimits(harness.redis);
    const blocked = await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: `cache-${ANON_PROBLEM_LIMIT}`, language: 'python', source: SOURCE },
    });
    assert.equal(blocked.statusCode, 403, '카운터 컬럼을 신뢰해 한도가 풀렸다');
  });

  test('서명이 깨진 익명 쿠키는 남의 세션을 가리키지 못한다', async () => {
    const victim = createClient(harness.app);
    await seedProblem({ slug: 'victim-problem' });

    await victim.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: 'victim-problem', language: 'python', source: SOURCE },
    });

    const victimSessions = await getPool().query(`SELECT id FROM anon_sessions`);
    const victimId = victimSessions.rows[0].id;

    // 서명 없이 세션 ID 만 넣은 쿠키
    const attacker = createClient(harness.app);
    attacker.setCookie('mlca_anon', victimId);
    await resetRateLimits(harness.redis);

    await attacker.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: 'victim-problem', language: 'python', source: SOURCE },
    });

    const sessions = await getPool().query(`SELECT count(*)::int AS n FROM anon_sessions`);
    assert.equal(sessions.rows[0].n, 2, '위조 쿠키가 기존 세션을 가로챘다');

    const victimSubmissions = await getPool().query(
      `SELECT count(*)::int AS n FROM submissions WHERE anon_session_id = $1`,
      [victimId],
    );
    assert.equal(victimSubmissions.rows[0].n, 1, '남의 세션에 제출이 붙었다');
  });

  // --- DoD 8 ---------------------------------------------------------------

  test('같은 문제 연속 제출이 빈도 제한에 걸린다', async () => {
    const client = createClient(harness.app);
    await seedProblem({ slug: 'cooldown' });

    const first = await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: 'cooldown', language: 'python', source: SOURCE },
    });
    assert.equal(first.statusCode, 202);

    const second = await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: 'cooldown', language: 'python', source: SOURCE },
    });
    assert.equal(second.statusCode, 429);
    assert.equal(second.json().code, 'RATE_LIMITED');
    assert.ok(Number(second.headers['retry-after']) > 0, 'Retry-After 가 없다');
  });

  test('제한에 걸린 요청은 큐에 들어가지 않는다', async () => {
    const client = createClient(harness.app);
    await seedProblem({ slug: 'no-enqueue' });

    await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: 'no-enqueue', language: 'python', source: SOURCE },
    });
    await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: 'no-enqueue', language: 'python', source: SOURCE },
    });

    // 채점 자원이 유한하므로 큐 앞단에서 걸러야 한다 (docs/TECHNICAL.md §7.3).
    assert.equal(harness.enqueued.length, 1, '거부된 제출이 큐에 들어갔다');

    const rows = await getPool().query(`SELECT count(*)::int AS n FROM submissions`);
    assert.equal(rows.rows[0].n, 1, '거부된 제출이 DB 에 기록됐다');
  });

  // --- DoD 7 ---------------------------------------------------------------

  test('익명 제출은 SSE 스트림에 오르지 않는다', async () => {
    const client = createClient(harness.app);
    await seedProblem({ slug: 'stream-anon' });

    /** @type {Record<string, unknown>[]} */
    const events = [];
    const unsubscribe = harness.stream.subscribe((event) => events.push(event));

    const submitted = await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: 'stream-anon', language: 'python', source: SOURCE },
    });
    const id = submitted.json().submission_id;
    await markJudged({ id, verdict: 'AC' });
    await harness.stream.emitForTest(id);

    assert.equal(events.length, 0, '익명 제출이 스트림에 실렸다');
    unsubscribe();
  });

  test('로그인 사용자의 제출은 스트림에 오른다', async () => {
    const client = createClient(harness.app);
    await seedProblem({ slug: 'stream-user' });
    await client.request({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'stream@example.com', handle: 'streamer', password: 'password123' },
    });

    /** @type {Record<string, unknown>[]} */
    const events = [];
    const unsubscribe = harness.stream.subscribe((event) => events.push(event));

    const submitted = await client.request({
      method: 'POST',
      url: '/api/submissions',
      payload: { problem_slug: 'stream-user', language: 'python', source: SOURCE },
    });
    const id = submitted.json().submission_id;
    await markJudged({ id, verdict: 'AC' });
    await harness.stream.emitForTest(id);

    assert.equal(events.length, 1);
    assert.equal(events[0]?.['handle'], 'streamer');
    // 스트림 이벤트에도 원문·상세는 없다.
    assert.deepEqual(Object.keys(events[0] ?? {}).sort(), [
      'handle',
      'id',
      'problem',
      'runtime_ms',
      'verdict',
    ]);
    unsubscribe();
  });
});
