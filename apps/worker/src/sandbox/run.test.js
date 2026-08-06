/**
 * 판정 분류 로직 — 러너가 JSON 을 내지 못했을 때가 위험한 구간이다.
 *
 * 러너가 정상으로 끝나면 판정은 러너가 정한다. 문제는 컨테이너가 죽어 아무 출력도
 * 없을 때다. 그때 `MLE` 와 `TLE` 를 가르는 근거는 종료 코드와 OOM 플래그뿐인데,
 * cgroup OOM 도 SIGKILL 도 똑같이 137 로 나타난다. 순서를 틀리면 메모리 초과가
 * 시간 초과로 보고된다.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyWithoutOutput, parseRunnerOutput } from './run.js';

test('OOM 은 137 과 겹쳐도 MLE 로 분류된다', () => {
  // cgroup OOM 킬도 137 이다. OOM 플래그를 먼저 보지 않으면 MLE 가 TLE 로 뒤집힌다.
  const result = classifyWithoutOutput({ exitCode: 137, oomKilled: true, hostTimedOut: false });
  assert.equal(result.verdict, 'MLE');
  assert.equal(result.error, null);
});

test('SIGKILL(137) 은 OOM 이 아니면 TLE 다', () => {
  const result = classifyWithoutOutput({ exitCode: 137, oomKilled: false, hostTimedOut: false });
  assert.equal(result.verdict, 'TLE');
});

test('coreutils timeout(124) 도 TLE 다', () => {
  assert.equal(
    classifyWithoutOutput({ exitCode: 124, oomKilled: false, hostTimedOut: false }).verdict,
    'TLE',
  );
});

test('호스트 쪽 상한에 걸려도 TLE 다', () => {
  // 컨테이너가 굳어 docker wait 이 안 돌아온 경우. 종료 코드를 모른다.
  assert.equal(
    classifyWithoutOutput({ exitCode: null, oomKilled: false, hostTimedOut: true }).verdict,
    'TLE',
  );
});

test('설명되지 않는 종료는 IE 다 — 사용자에게 책임을 씌우지 않는다', () => {
  const result = classifyWithoutOutput({ exitCode: 1, oomKilled: false, hostTimedOut: false });
  assert.equal(result.verdict, 'IE');
  assert.ok(result.error, 'IE 는 인프라 오류 설명을 남겨야 한다');
});

test('정상 종료인데 출력이 없어도 IE 다', () => {
  // 러너는 항상 JSON 을 낸다. 0 으로 끝났는데 출력이 없으면 러너가 깨진 것이다.
  assert.equal(
    classifyWithoutOutput({ exitCode: 0, oomKilled: false, hostTimedOut: false }).verdict,
    'IE',
  );
});

test('러너 JSON 한 줄을 읽는다', () => {
  const output = parseRunnerOutput('{"verdict":"AC","cases":[],"total_runtime_ms":3}\n');
  assert.equal(output?.verdict, 'AC');
});

test('앞뒤에 잡음이 섞여도 마지막 유효 JSON 을 고른다', () => {
  const stdout = [
    'some runtime noise',
    '{"verdict":"WA","cases":[],"total_runtime_ms":1}',
    'trailing noise',
  ].join('\n');
  assert.equal(parseRunnerOutput(stdout)?.verdict, 'WA');
});

test('verdict 가 없는 JSON 은 결과로 인정하지 않는다', () => {
  // 사용자 코드가 JSON 을 찍어 판정을 가로채는 것을 막는다.
  assert.equal(parseRunnerOutput('{"hello":"world"}'), null);
});

test('사용자가 찍은 가짜 판정보다 러너의 마지막 줄을 신뢰한다', () => {
  const stdout = ['{"verdict":"AC","cases":[]}', '{"verdict":"WA","cases":[]}'].join('\n');
  assert.equal(parseRunnerOutput(stdout)?.verdict, 'WA');
});

test('출력이 비었거나 JSON 이 아니면 null', () => {
  for (const stdout of ['', '   \n\n', 'Traceback (most recent call last):', 'not json']) {
    assert.equal(parseRunnerOutput(stdout), null);
  }
});
