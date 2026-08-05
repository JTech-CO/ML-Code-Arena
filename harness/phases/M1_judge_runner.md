# M1 — 채점 러너 + 격리 컨테이너 ★

**상태**: 구현 완료 · **게이트 미실행 (Docker 데몬 미기동 — 사용자 조작 대기)**
**갱신**: 2026-08-06

## 맥락
**전체 계약의 원점.** 판정 코드와 러너 출력 스키마가 여기서 확정되고, API·워커·UI가 전부 이것을 소비한다. 동시에 이 프로젝트에서 유일하게 신뢰할 수 없는 코드를 실행하는 지점이므로 격리 불변식 4건(INV-4·INV-6·INV-7·INV-8)이 전부 여기에 걸린다.

이 phase는 HTTP도 DB도 없이 **CLI만으로 완결**되어야 한다. 웹 계층이 붙기 전에 채점기가 검증되어야 한다.

## 진입조건 (DoR)
- [x] M0 DoD 통과 (2026-08-06, 저장소 경로에서 재현 확인)
- [x] `docs/TECHNICAL.md` §4(채점 엔진)·§5(격리) 정독
- [x] INV-4·INV-5·INV-6·INV-7·INV-8 확인
- [ ] **Docker 이미지 빌드 가능 환경 확인 — 미충족.** CLI 는 29.6.2 로 설치돼 있으나
      데몬이 꺼져 있다. Docker Desktop 을 에이전트 프로세스에서 띄우지 못했고
      서비스 시작은 권한 거부였다. 사용자가 Docker Desktop 을 실행해야 한다.

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

## 증거

### 이미 통과한 것 (Docker 불필요)

~~~
$ python -m unittest discover -s judge/tests -p "test_*.py"
Ran 36 tests ... OK
~~~

러너의 **판정을 가르는 순수 로직**(정적 검사·비교·직렬화)을 결정론적으로 확인했다.
격리는 컨테이너가 있어야 하지만, 정적 검사 규칙 하나가 조용히 무너지면 `FBD` 가 `AC` 로
바뀌고 그건 컨테이너를 아무리 잘 잠가도 막지 못한다.

이 테스트가 **실제 버그 1건을 잡았다**: `allowed_imports` 화이트리스트에 있는 모듈이
문제별 블랙리스트에도 있으면 거부되고 있었다. ADR-0002 는 화이트리스트가 이긴다고
정했으므로 위반이다. 우선순위를 하드 차단 > 화이트리스트 > 문제별 블랙리스트로 확정했다.

INV-5·INV-7 은 단위 테스트로도 직접 검증된다.
- 불일치 상세에 기대 수치·dict 키 이름이 실리지 않는지 (INV-5)
- dtype 이 객체인 `.npy` 를 손으로 만들어 npz 에 넣었을 때 로더가 거부하는지 (INV-7)

또한 M0 게이트 5종이 M1 코드 추가 후에도 전부 그린이다
(`build` / `typecheck` / `lint` / `test` / `check:boundaries`).

### 남은 것 (Docker 필요)

~~~
pnpm judge:image        # docker build -t mlca-python:3.11 judge/image
pnpm judge:fixtures     # DoD 1~5, 7~9 전부
~~~

`judge-fixtures.js` 가 다음을 자동 검증하도록 짜여 있다.

| DoD | 검증 방식 |
|---|---|
| 1 | `judge-cli --json` 출력이 §4.2.3 스키마와 일치 |
| 2 | 판정 8종 재현 표 (샘플 11건, 8종 커버 확인) |
| 3 | `network.py` → `RE` + 커널 상태 프로브(인터페이스·seccomp·CapEff·NoNewPrivs·uid) |
| 4 | `fbd.py` → `FBD` (최상위 `raise` 미실행이 곧 증거) |
| 5 | 컨테이너 ID 상이 + `tmp_read.py` 가 `AC` |
| 7 | 기대값 문자열을 컨테이너에서 뽑아 `WA` 출력에 grep |
| 8 | `mle.py` → `MLE`, `tle.py` → `TLE` |
| 9 | 유계 fork 루프의 성공 횟수가 `pids-limit` 이하 |

### DoD 6 — 게이트 문구 조정 필요 (사용자 결정)

검증 명령 `grep -rn "pickle\|\.pkl" judge/ | wc -l  # 0` 이 **2건**을 잡는다.
둘 다 `judge/runner/codec.py` 의 같은 사안이다.

~~~
codec.py:136   주석 — `allow_pickle=False` 를 명시하는 것이 1차 방어이고...
codec.py:146   with np.load(npz_path, allow_pickle=False) as handle:
~~~

이 줄은 그 포맷을 **쓰는** 코드가 아니라 **끄는** 코드다. 즉 INV-7 위반이 아니라
INV-7 의 집행 지점이다. 게이트가 컴플라이언스 코드에 걸리는 거짓 양성이다.

빼면 게이트는 문자 그대로 통과하지만, numpy 의 기본값(현재 False)에 의존하게 된다.
기본값이 바뀌면 신뢰 경계가 조용히 무너지고, 그건 HARNESS.md §3 의 최상위 우선순위를
뒤집는 거래다. **코드는 안전한 쪽으로 두었고 게이트는 손대지 않았다.**

제안: DoD 6 을 다음으로 바꾼다.
1. `judge/` 에서 그 포맷을 **활성화**하는 사용이 0건 (`allow_pickle=True` 금지)
2. dtype 이 객체인 적대적 `.npz` 를 로더가 거부하는 테스트 통과 — **이미 구현·통과**

2번은 grep 보다 강한 보증이다. grep 은 "안 쓴다"를 보고, 이건 "오염된 파일을 실제로
막는다"를 본다.

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
