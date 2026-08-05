# GLOSSARY.md — 공유 용어집

> 에이전트와 사람이 같은 단어를 같은 뜻으로 쓰게 한다. 세션 간 용어 표류를 막는 장치.

## 용어 충돌 경고 — "하네스"

이 프로젝트에서 "하네스"는 **두 가지 뜻**으로 쓰일 수 있다. 혼동을 막기 위해 다음 표기를 강제한다.

| 대상 | 이 저장소에서의 표기 | 뜻 |
|---|---|---|
| 이 팩 자체 (CLAUDE/HARNESS/INVARIANTS…) | **작업 하네스** 또는 그냥 `HARNESS.md` | Claude Code 운영 규율 |
| 사용자 코드를 호출·비교하는 채점 스크립트 | **채점 러너 (Judge Runner)** | `judge/runner/runner.py` |

기술 백서 초안에서 후자를 "하네스"로 부른 대목이 있으나, 이 저장소에서는 **항상 "채점 러너"로 부른다.** 코드·주석·커밋 메시지에서도 동일하다.

## 작업 하네스 용어

| 용어 | 정의 |
|---|---|
| DoR (Definition of Ready) | phase 진입조건. 만족해야 작업 시작 가능 |
| DoD (Definition of Done) | phase 완료 게이트. 전부 충족해야 완료 |
| 불변식 (Invariant) | 절대 위반 불가 규칙. 1건 위반 시 통과 금지(`INVARIANTS.md`) |
| 정합성 (Parity) | 같은 로직의 두 구현이 동일 입력에 동일 출력 |
| 게이트 (Gate) | 측정 가능한 통과/실패 판정 기준 |
| 증거 (Evidence) | 게이트 통과의 근거가 되는 명령과 출력 |

## 프로젝트 용어

| 용어 | 정의 |
|---|---|
| 제출 (Submission) | 사용자가 특정 문제에 보낸 소스 코드 1건 |
| 채점 (Judge) | 제출을 격리 환경에서 실행하고 판정을 산출하는 행위 |
| 채점 러너 (Judge Runner) | 컨테이너 안에서 사용자 코드를 import·호출하고 결과를 비교하는 플랫폼 제공 스크립트 |
| 엔트리포인트 (Entrypoint) | 사용자가 반드시 구현해야 하는 함수 이름. 문제별 지정 |
| 판정 (Verdict) | 채점 결과 상태 코드. `AC` `WA` `TLE` `MLE` `RE` `CE` `FBD` `IE` |
| `tolerance` 모드 | 반환값을 허용 오차(rtol/atol) 내에서 비교하는 채점 모드 |
| `structural` 모드 | AST로 금지 import·호출을 정적 검사하는 모드. `tolerance`와 항상 함께 적용 |
| `FBD` (Forbidden) | 정적 검사 위반 판정. 이 플랫폼 고유 판정 |
| `IE` (Internal Error) | 채점 인프라 장애. 사용자 책임 아님. 통계·랭킹 집계 제외 |
| 제한 (Restriction) | 문제별 허용/금지 import·builtin 규칙. `problem.json`의 `restrictions` |
| 제한 칩 (Restriction Chip) | 제한을 목록·상세에 노출하는 UI 요소 |
| 기대값 (Expect) | 테스트케이스의 정답 반환값. 사용자에게 절대 노출 금지(INV-5) |
| shape 대조 | `WA` 시 기대 shape와 실제 shape를 나란히 보여주는 UI 블록 |
| 익명 세션 (Anon Session) | 비로그인 사용자의 서버 측 식별자. 고유 문제 10개까지 허용 |
| 계정 승계 (Merge) | 로그인 시 익명 세션의 제출 이력을 계정으로 재할당하는 처리 |
| 문제 정의 (Problem Definition) | `problems/<slug>/` 하위의 `problem.json` + `statement.md` + `reference.py` + `generator.py` + 케이스 |
| 단계 (Tier) | 커리큘럼 단계 1~9. Phase 1은 1·2·4·5만 사용 |
