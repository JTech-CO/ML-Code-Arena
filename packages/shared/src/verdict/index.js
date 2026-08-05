/**
 * 판정 코드 단일 정의 — docs/TECHNICAL.md §4.3.
 *
 * 러너(Python)·DB enum·API 응답·`VerdictLabel`·카피가 전부 이 목록을 따른다.
 * 러너는 언어가 달라 재구현이 불가피하므로, 목록 일치는 M1 에서 테스트로 강제한다
 * (docs/FILE_TREE.md §4).
 *
 * 판정을 추가·변경할 때는 HARNESS.md §4.4 의 5곳을 **동시에** 고친다.
 * 하나라도 빠지면 UI 에 빈 칸이 뜬다.
 */

/**
 * 채점 결과 상태 코드.
 * @typedef {'AC'|'WA'|'TLE'|'MLE'|'RE'|'CE'|'FBD'|'IE'} Verdict
 */

/**
 * 판정 코드 정본 목록. 순서는 docs/TECHNICAL.md §4.3 표와 같다.
 * 표·통계·픽스처 순회는 이 순서를 쓴다.
 * @type {readonly Verdict[]}
 */
export const VERDICTS = Object.freeze([
  'AC',
  'WA',
  'TLE',
  'MLE',
  'RE',
  'CE',
  'FBD',
  'IE',
]);

/**
 * 이름으로 접근하기 위한 맵. 값은 {@link VERDICTS} 와 동일하다.
 */
export const VERDICT = Object.freeze({
  /** @type {'AC'} */ AC: 'AC',
  /** @type {'WA'} */ WA: 'WA',
  /** @type {'TLE'} */ TLE: 'TLE',
  /** @type {'MLE'} */ MLE: 'MLE',
  /** @type {'RE'} */ RE: 'RE',
  /** @type {'CE'} */ CE: 'CE',
  /** @type {'FBD'} */ FBD: 'FBD',
  /** @type {'IE'} */ IE: 'IE',
});

/**
 * 판정별 메타데이터.
 *
 * `meaning` 은 명세상의 의미(docs/TECHNICAL.md §4.3)이며 UI 카피가 아니다.
 * 사용자에게 보여줄 문장은 docs/DESIGN.md §11.2 를 따르며 표현 계층이 소유한다.
 *
 * @typedef {object} VerdictMeta
 * @property {Verdict} code 판정 코드
 * @property {string} meaning 명세상의 의미
 * @property {string} cause 발생 조건
 * @property {boolean} userFault 사용자 코드 책임인지. `IE` 만 false
 * @property {boolean} countsInStats 랭킹·제출 통계 집계 대상인지. `IE` 는 제외(§4.3)
 * @property {boolean} autoRetry 채점 자동 재시도 대상인지. `IE` 만 true
 */

/**
 * @type {Readonly<Record<Verdict, VerdictMeta>>}
 */
export const VERDICT_META = Object.freeze({
  AC: Object.freeze({
    code: VERDICT.AC,
    meaning: '정답',
    cause: '전 케이스 통과',
    userFault: true,
    countsInStats: true,
    autoRetry: false,
  }),
  WA: Object.freeze({
    code: VERDICT.WA,
    meaning: '오답',
    cause: '허용 오차 밖 또는 shape 불일치',
    userFault: true,
    countsInStats: true,
    autoRetry: false,
  }),
  TLE: Object.freeze({
    code: VERDICT.TLE,
    meaning: '시간 초과',
    cause: '벽시계 제한 초과',
    userFault: true,
    countsInStats: true,
    autoRetry: false,
  }),
  MLE: Object.freeze({
    code: VERDICT.MLE,
    meaning: '메모리 초과',
    cause: 'cgroup OOM 발생',
    userFault: true,
    countsInStats: true,
    autoRetry: false,
  }),
  RE: Object.freeze({
    code: VERDICT.RE,
    meaning: '런타임 오류',
    cause: '예외 발생, 엔트리포인트 부재',
    userFault: true,
    countsInStats: true,
    autoRetry: false,
  }),
  CE: Object.freeze({
    code: VERDICT.CE,
    meaning: '구문 오류',
    cause: 'AST 파싱 실패',
    userFault: true,
    countsInStats: true,
    autoRetry: false,
  }),
  FBD: Object.freeze({
    code: VERDICT.FBD,
    meaning: '금지 사용',
    cause: '정적 검사 위반',
    userFault: true,
    countsInStats: true,
    autoRetry: false,
  }),
  IE: Object.freeze({
    code: VERDICT.IE,
    meaning: '내부 오류',
    cause: '채점 인프라 장애 (사용자 책임 아님)',
    userFault: false,
    countsInStats: false,
    autoRetry: true,
  }),
});

/**
 * 임의의 값이 판정 코드인지 판별한다.
 * @param {unknown} value
 * @returns {value is Verdict}
 */
export function isVerdict(value) {
  return typeof value === 'string' && VERDICTS.includes(/** @type {Verdict} */ (value));
}

/**
 * 판정이 랭킹·제출 통계 집계 대상인지.
 * `IE` 는 사용자 책임이 아니므로 집계에서 제외한다 (docs/TECHNICAL.md §4.3).
 * @param {Verdict} verdict
 * @returns {boolean}
 */
export function countsInStats(verdict) {
  return VERDICT_META[verdict].countsInStats;
}
