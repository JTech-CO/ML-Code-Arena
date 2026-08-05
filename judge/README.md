# judge/ — 채점 러너 (Python)

이 디렉터리는 Python 이므로 **pnpm 워크스페이스에 포함하지 않는다** (`docs/FILE_TREE.md` §1).
JS 코드가 `judge/` 를 import 하는 것은 경계 위반이다. 워커는 파일 경로와 컨테이너로만 접촉한다.

| 경로 | 역할 |
|---|---|
| `image/Dockerfile` | `python:3.11-slim` + numpy·scipy. 런타임만 담고 러너는 굽지 않는다 |
| `image/requirements.txt` | numpy·scipy **정확 고정**. 흔들리면 정답이 `WA` 로 떨어진다 |
| `runner/runner.py` | 실행 순서 조립. 컨테이너 안의 유일한 진입점 |
| `runner/spec.py` | 채점 명세 로드. 여기서 나는 오류는 `IE` (플랫폼 책임) |
| `runner/ast_check.py` | 정적 검사. 사용자 코드 import 보다 **먼저** 실행 (INV-6) |
| `runner/compare.py` | `tolerance` 비교. 기대값을 상세에 싣지 않는다 (INV-5) |
| `runner/codec.py` | 케이스 직렬화. 태그 트리 + `.npz` (INV-7) |
| `runner/make_cases.py` | `reference.py` 로 기대값 생성 (INV-10) |
| `fixtures/` | 판정 8종 재현 샘플 + 격리 검증 샘플 |
| `tests/` | 러너 순수 로직 단위 테스트 |

## 실행 순서는 바꾸지 않는다

    spec 로드 → 소스 읽기 → 파싱(CE) → **AST 검사(FBD)** → import
              → 엔트리포인트 확인(RE) → 케이스 실행 → 비교 → JSON 1줄

`import` 가 검사보다 앞서면 모듈 최상위 코드가 먼저 실행된다. 그 순간 검사는
"실행을 막는 장치"가 아니라 "이미 실행된 코드에 대한 사후 보고"가 된다.

## 이 디렉터리에 걸린 불변식

- **INV-4** 컨테이너는 네트워크에 접근할 수 없다.
- **INV-5** 기대값이 stdout·stderr 어디에도 등장하지 않는다.
- **INV-6** AST 정적 검사는 사용자 코드 import 보다 먼저 실행된다.
- **INV-7** 테스트케이스 직렬화 포맷은 `.npz` / JSON 만 허용한다 (ADR-0003).
  이 줄에 금지 포맷 이름을 적지 않는 것은 의도다 — M1 DoD 6 이 `judge/` 전체를 그 문자열로
  grep 하여 0건을 요구하므로, 설명문 한 줄이 게이트를 거짓으로 실패시킨다.
- **INV-8** 컨테이너는 제출 1건당 새로 생성되며 재사용되지 않는다.
