/**
 * 사용자에게 보이는 문구 (docs/DESIGN.md §11).
 *
 * 톤은 평서형·사무적이며 사과하지 않는다. 이모지를 쓰지 않는다.
 *
 * 판정 코드 자체는 `@mlca/shared` 가 단일 출처다. 여기는 그 코드에 붙는 **문장**이며,
 * 판정을 추가할 때 함께 고쳐야 하는 다섯 곳 중 하나다 (HARNESS.md §4.4).
 */

/** @typedef {import('@mlca/shared').Verdict} Verdict */

/**
 * 판정별 기본 메시지 (§11.2).
 * `WA` 와 `FBD` 는 상세가 있을 때 더 구체적인 문장으로 대체된다 — 침묵하는 오답은
 * 학습을 방해한다.
 * @type {Record<Verdict, string>}
 */
export const VERDICT_MESSAGE = Object.freeze({
  AC: '정답입니다.',
  WA: '값이 다릅니다.',
  TLE: '10초 안에 끝나지 않았습니다.',
  MLE: '메모리 512MB를 넘었습니다.',
  RE: '실행 중 오류가 발생했습니다.',
  CE: '코드를 해석할 수 없습니다.',
  FBD: '허용되지 않은 것을 사용했습니다.',
  IE: '채점 시스템 오류입니다. 자동으로 다시 채점합니다. 이 제출은 통계에 포함되지 않습니다.',
});

/**
 * 판정 + 상세로 한 문장을 만든다.
 * @param {Verdict|null} verdict
 * @param {Record<string, any>|null} detail
 * @returns {string}
 */
export function verdictMessage(verdict, detail) {
  if (!verdict) return '';

  if (verdict === 'WA' && detail) {
    if (detail['reason'] === 'shape_mismatch') return '반환값의 shape 가 다릅니다.';
    if (detail['reason'] === 'length_mismatch') return '반환값의 길이가 다릅니다.';
    if (detail['reason'] === 'type_mismatch') {
      return `반환 타입이 다릅니다. ${detail['expected_type']} 를 기대했습니다.`;
    }
    if (detail['reason'] === 'dtype_mismatch') return 'dtype 이 다릅니다.';
    if (detail['reason'] === 'key_mismatch') return '반환한 dict 의 키가 다릅니다.';
  }

  // FBD 는 어떤 규칙을 위반했는지 반드시 명시한다 (§11.2).
  if (verdict === 'FBD' && Array.isArray(detail?.['violations']) && detail['violations'][0]) {
    return detail['violations'][0].message;
  }

  if ((verdict === 'CE' || verdict === 'RE') && detail?.['message']) {
    return detail['message'];
  }

  return VERDICT_MESSAGE[verdict] ?? '';
}

export const EMPTY = Object.freeze({
  submissions: '아직 제출한 코드가 없습니다. 1단계 문제부터 시작해보세요.',
  filteredProblems: '조건에 맞는 문제가 없습니다. 필터를 줄여보세요.',
  ranking: '아직 해결된 문제가 없습니다.',
  stream: '아직 채점된 제출이 없습니다.',
  concepts: '아직 등록된 개념 문서가 없습니다.',
});

/** 한 동작은 흐름 전체에서 같은 이름을 유지한다 (§11.4). */
export const SUBMIT = Object.freeze({
  idle: '제출',
  sending: '제출 중',
  judging: '채점 중',
  done: '채점 완료',
});
