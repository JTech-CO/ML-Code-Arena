# judge/ — 채점 러너 (Python)

**M1 에서 구현한다.** 현재는 디렉터리 골격만 있다.

이 디렉터리는 Python 이므로 **pnpm 워크스페이스에 포함하지 않는다** (`docs/FILE_TREE.md` §1).
JS 코드가 `judge/` 를 import 하는 것은 경계 위반이다. 워커는 파일 경로와 컨테이너로만 접촉한다.

| 경로 | 역할 | phase |
|---|---|---|
| `image/Dockerfile` | `python:3.11-slim` + numpy·scipy | M1 |
| `runner/spec.py` | 채점 명세 로드 | M1 |
| `runner/ast_check.py` | 정적 검사 (import 보다 **먼저** 실행, INV-6) | M1 |
| `runner/compare.py` | `tolerance` 비교 | M1 |
| `runner/runner.py` | 실행 순서 조립 | M1 |
| `fixtures/` | 판정 8종 재현 샘플 | M1 |

## 이 디렉터리에 걸린 불변식

- **INV-4** 컨테이너는 네트워크에 접근할 수 없다.
- **INV-5** 기대값이 stdout·stderr 어디에도 등장하지 않는다.
- **INV-6** AST 정적 검사는 사용자 코드 import 보다 먼저 실행된다.
- **INV-7** 테스트케이스 직렬화 포맷은 `.npz` / JSON 만 허용한다 (ADR-0003).
  이 줄에 금지 포맷 이름을 적지 않는 것은 의도다 — M1 DoD 6 이 `judge/` 전체를 그 문자열로
  grep 하여 0건을 요구하므로, 설명문 한 줄이 게이트를 거짓으로 실패시킨다.
- **INV-8** 컨테이너는 제출 1건당 새로 생성되며 재사용되지 않는다.
