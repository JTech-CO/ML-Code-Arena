-- `IE` 발생 상세를 영구 보존한다 (docs/TECHNICAL.md §13.1).
--
-- §6.1 의 스키마에는 없는 컬럼이다. 0002 가 `judging_at` 을 더한 것과 같은 이유로
-- 더한다 — 백서가 요구하는 운영 항목("IE 발생 상세 | 영구")을 기존 컬럼으로는
-- 담을 수 없다.
--
-- **`detail` 에 같이 담지 않는 이유**: `detail` 은 API 로 나가는 컬럼이고,
-- `apps/api/src/serialize.js` 의 통과 목록이 무엇이 나갈지 정한다(INV-5). 운영용
-- 문자열을 그 컬럼에 섞으면 "통과 목록에 실수로 한 줄 더하면 새어 나가는" 상태가 된다.
-- 나가지 않아야 하는 값은 나갈 수 있는 컬럼에 두지 않는다.
--
-- 담기는 것은 도커·러너가 낸 실패 사유이며 사용자 코드나 기대값이 아니다.
ALTER TABLE submissions ADD COLUMN ie_reason text;

COMMENT ON COLUMN submissions.ie_reason IS
  'IE 원인 (운영 전용). API 응답에 실리지 않는다 — serialize.js 통과 목록 밖이다.';

-- 알림 질의가 최근 구간만 훑는다. IE 는 드물어야 하므로 부분 인덱스로 충분하다.
CREATE INDEX submissions_ie_recent_idx ON submissions (judged_at DESC)
  WHERE verdict = 'IE';
