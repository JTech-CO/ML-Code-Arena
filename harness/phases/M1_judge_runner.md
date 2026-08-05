# M1 — 채점 러너 + 격리 컨테이너 ★

**상태**: 미시작  **갱신**: 2026-08-05

## 맥락
**전체 계약의 원점.** 판정 코드와 러너 출력 스키마가 여기서 확정되고, API·워커·UI가 전부 이것을 소비한다. 동시에 이 프로젝트에서 유일하게 신뢰할 수 없는 코드를 실행하는 지점이므로 격리 불변식 4건(INV-4·INV-6·INV-7·INV-8)이 전부 여기에 걸린다.

이 phase는 HTTP도 DB도 없이 **CLI만으로 완결**되어야 한다. 웹 계층이 붙기 전에 채점기가 검증되어야 한다.

## 진입조건 (DoR)
- [ ] M0 DoD 통과
- [ ] `docs/TECHNICAL.md` §4(채점 엔진)·§5(격리) 정독
- [ ] INV-4·INV-5·INV-6·INV-7·INV-8 확인
- [ ] Docker 이미지 빌드 가능 환경 확인

## 할 일
`judge/image/Dockerfile`(python:3.11-slim + numpy·scipy) -> `judge/runner/spec.py`(채점 명세 로드) -> `judge/runner/ast_check.py`(정적 검사) -> `judge/runner/compare.py`(tolerance 비교) -> `judge/runner/runner.py`(실행 순서 조립) -> `apps/worker/src/sandbox.js`(컨테이너 실행 옵션 단일 상수 + spawn) -> `tools/judge-cli.js`(로컬 채점 CLI).

**실행 순서는 반드시**: spec 로드 → AST 검사 → (통과 시에만) import → 엔트리포인트 확인 → 케이스 실행 → 비교 → JSON 출력.

## 참조
`docs/TECHNICAL.md` §4.1(채점 모드), §4.2(프로토콜), §4.3(판정 코드), §5(격리), INV-4·INV-5·INV-6·INV-7·INV-8.

## DoD (완료 게이트)
1. `node tools/judge-cli.js --problem <slug> --source <file>` 로 채점이 완결되고, 러너 출력이 `docs/TECHNICAL.md` §4.2.3 스키마와 일치한다.
2. **판정 8종이 전부 재현된다.** 각 판정을 유발하는 고정 샘플 제출을 `judge/fixtures/`에 두고 8건 전부 기대 판정과 일치.
3. 네트워크 호출을 시도하는 샘플이 실패한다(INV-4 준수) — 컨테이너 내부에서 외부 접속 시도 → 실패 + `RE`.
4. 모듈 최상위에 부작용 코드(`open('/tmp/x','w')`)를 둔 금지 import 샘플이 **부작용 없이** `FBD` 판정을 받는다(INV-6 준수).
5. 연속 2회 제출에서 컨테이너 ID가 다르고, 1회차가 `/tmp`에 쓴 파일을 2회차가 읽지 못한다(INV-8 준수).
6. `judge/` 전체 grep에서 `pickle`·`.pkl` 이 0건(INV-7 준수).
7. 러너 stdout·stderr·CLI 출력 어디에도 기대값이 등장하지 않는다(INV-5 준수) — `WA` 샘플 출력에서 기대값 문자열 grep 0건.
8. `--memory=512m` 초과 샘플이 `MLE`, 무한 루프 샘플이 10초 내 `TLE`로 종료된다.
9. fork bomb 샘플이 `--pids-limit=64`에 막혀 호스트에 영향 없이 종료된다.

## 검증
~~~
docker build -t mlca-python:3.11 judge/image
for f in judge/fixtures/*.py; do node tools/judge-cli.js --problem fixture --source "$f"; done
grep -rn "pickle\|\.pkl" judge/ | wc -l          # 0 이어야 함
node tools/judge-cli.js --problem gd-1d --source judge/fixtures/wa.py | grep -c "<기대값 문자열>"   # 0
~~~

## 증거 (통과 시 명령·핵심 출력 붙여넣기)
~~~
{{판정 8종 재현 결과 표, 격리 샘플 결과, grep 카운트}}
~~~

## 롤백 계획
러너는 컨테이너 안에서만 도는 독립 코드이므로 파일 단위 revert로 충분하다. 이미지는 태그를 버전으로 고정(`mlca-python:3.11-<n>`)해 이전 태그로 되돌린다.

## 리스크 / 미지수
- Docker 소켓 마운트가 사실상 호스트 루트 권한과 동등하다. rootless 전환 여부는 ADR-0007 후보이며 M2 진입 전 결정이 바람직하다.
- 컨테이너 콜드 스타트(200~400ms)가 시간 측정에 포함되면 `TLE` 오탐이 난다. 시간은 **러너 내부 기준**으로 측정한다.
- AST 검사는 완벽하지 않다. Phase 1 목표는 "무심코 사용 방지"이며 정교한 우회는 범위 밖임을 명시한다.

## 주의
- **격리 옵션이 걸려서 채점이 안 될 때 옵션을 푸는 것은 레드라인이다.** 그 상황은 STOP 대상이다.
- 판정 8종 중 `AC`만 확인하고 넘어가지 않는다. 채점기의 가치는 오답을 정확히 분류하는 데 있다.
- `IE`는 사용자 책임이 아니므로 재시도 대상이며 통계에서 제외된다. 이 구분을 여기서부터 지킨다.
