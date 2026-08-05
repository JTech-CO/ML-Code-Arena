import assert from 'node:assert/strict';
import { test } from 'node:test';

import { VERDICT, VERDICTS, VERDICT_META, countsInStats, isVerdict } from './index.js';

/**
 * docs/TECHNICAL.md §4.3 표를 그대로 옮긴 기대 목록.
 * 이 배열을 소스에서 import 하지 않는 것이 핵심이다 — 문서와 코드를 대조하는 테스트다.
 */
const EXPECTED = ['AC', 'WA', 'TLE', 'MLE', 'RE', 'CE', 'FBD', 'IE'];

test('판정 코드는 8종이며 백서 §4.3 과 순서까지 일치한다', () => {
  assert.deepEqual([...VERDICTS], EXPECTED);
  assert.equal(VERDICTS.length, 8);
});

test('판정 코드에 중복이 없다', () => {
  assert.equal(new Set(VERDICTS).size, VERDICTS.length);
});

test('VERDICT 맵과 VERDICTS 목록이 갈라지지 않는다', () => {
  assert.deepEqual(Object.keys(VERDICT), EXPECTED);
  for (const code of VERDICTS) {
    assert.equal(VERDICT[code], code);
  }
});

test('VERDICT_META 가 8종 전부를 덮는다', () => {
  assert.deepEqual(Object.keys(VERDICT_META), EXPECTED);
  for (const code of VERDICTS) {
    const meta = VERDICT_META[code];
    assert.equal(meta.code, code);
    assert.ok(meta.meaning.length > 0, `${code} 의 meaning 이 비어 있다`);
    assert.ok(meta.cause.length > 0, `${code} 의 cause 가 비어 있다`);
  }
});

test('상수가 동결되어 런타임에 변조되지 않는다', () => {
  assert.ok(Object.isFrozen(VERDICTS));
  assert.ok(Object.isFrozen(VERDICT));
  assert.ok(Object.isFrozen(VERDICT_META));
});

test('IE 만 사용자 책임이 아니고 통계에서 제외되며 자동 재시도 대상이다', () => {
  for (const code of VERDICTS) {
    const meta = VERDICT_META[code];
    const isIE = code === 'IE';
    assert.equal(meta.userFault, !isIE, `${code} 의 userFault 가 어긋난다`);
    assert.equal(meta.countsInStats, !isIE, `${code} 의 countsInStats 가 어긋난다`);
    assert.equal(meta.autoRetry, isIE, `${code} 의 autoRetry 가 어긋난다`);
    assert.equal(countsInStats(code), !isIE);
  }
});

test('isVerdict 는 목록에 없는 값을 거른다', () => {
  for (const code of VERDICTS) {
    assert.ok(isVerdict(code));
  }
  for (const bad of ['ac', 'PENDING', 'JUDGING', 'DONE', '', 'OK', null, undefined, 0, {}]) {
    assert.equal(isVerdict(bad), false, `${String(bad)} 를 판정으로 오인했다`);
  }
});
