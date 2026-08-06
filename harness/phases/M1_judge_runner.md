# M1 — 채점 러너 + 격리 컨테이너 ★

**상태**: 완료 · DoD 9/9 통과  **갱신**: 2026-08-06

## 맥락
**전체 계약의 원점.** 판정 코드와 러너 출력 스키마가 여기서 확정되고, API·워커·UI가 전부 이것을 소비한다. 동시에 이 프로젝트에서 유일하게 신뢰할 수 없는 코드를 실행하는 지점이므로 격리 불변식 4건(INV-4·INV-6·INV-7·INV-8)이 전부 여기에 걸린다.

이 phase는 HTTP도 DB도 없이 **CLI만으로 완결**되어야 한다. 웹 계층이 붙기 전에 채점기가 검증되어야 한다.

## 진입조건 (DoR)
- [x] M0 DoD 통과 (2026-08-06, 저장소 경로에서 재현 확인)
- [x] `docs/TECHNICAL.md` §4(채점 엔진)·§5(격리) 정독
- [x] INV-4·INV-5·INV-6·INV-7·INV-8 확인
- [x] Docker 이미지 빌드 가능 환경 확인 (engine 29.6.2, cgroup v2, seccomp builtin)

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
6. 안전하지 않은 직렬화를 **활성화**하는 코드가 0건이고, 오염된 케이스 파일이 실제로
   거부된다(INV-7 준수). 두 가지를 함께 본다.
   - `judge/` 에 `allow_pickle=True`·`import pickle`·`.pkl` 사용이 0건
   - dtype 이 객체인 적대적 `.npz` 를 로더가 거부하는 테스트 통과

   > 최초 문구는 `grep "pickle\|\.pkl" judge/` 가 0건이었으나, 그 검색은 INV-7 을
   > **집행하는** 코드(`allow_pickle=False`)를 위반으로 오인한다. 존재가 아니라
   > 활성화를 보도록 좁히고, 더 강한 보증인 적대적 파일 거부 테스트를 함께 요구한다.
   > grep 은 "안 쓴다"를 보고, 그 테스트는 "오염된 파일을 실제로 막는다"를 본다.
   > (2026-08-06 사용자 승인)
7. 러너 stdout·stderr·CLI 출력 어디에도 기대값이 등장하지 않는다(INV-5 준수) — `WA` 샘플 출력에서 기대값 문자열 grep 0건.
8. `--memory=512m` 초과 샘플이 `MLE`, 무한 루프 샘플이 10초 내 `TLE`로 종료된다.
9. fork bomb 샘플이 `--pids-limit=64`에 막혀 호스트에 영향 없이 종료된다.

## 검증
~~~
pnpm judge:image        # docker build -t mlca-python:3.11 judge/image
pnpm judge:fixtures     # 판정 8종 + 격리 불변식 + 커널 상태 + 기대값 비노출

# DoD 6 — 활성화 사용 0건 (allow_pickle=False 는 집행 코드이므로 걸리지 않는다)
grep -rniE "allow_pickle\s*=\s*True|^\s*import\s+pickle|\.pkl\b" judge/ | wc -l   # 0
~~~

개별 제출을 직접 채점할 때:

~~~
node tools/judge-cli.js --prepare --problem l2norm
node tools/judge-cli.js --problem l2norm --source <파일> [--json] [--expect AC]
~~~

## 증거

### 이미 통과한 것 (Docker 불필요)

~~~
$ python -m unittest discover -s judge/tests -p "test_*.py"    Ran 46 tests ... OK
$ pnpm test                                                    42건 (shared 13 + worker 29)
$ pnpm typecheck / lint / check:boundaries / build              전부 PASS
$ python -m py_compile (judge/ 전 파일)                         전부 ok, ce.py 만 의도대로 실패
~~~

격리는 컨테이너가 있어야 하지만, **판정을 가르는 로직**은 컨테이너 없이 확인할 수 있다.
정적 검사 규칙 하나가 조용히 무너지면 `FBD` 가 `AC` 로 바뀌고, 그건 컨테이너를 아무리
잘 잠가도 막지 못한다.

**테스트가 잡은 실제 버그 2건**
1. `allowed_imports` 화이트리스트에 있는 모듈이 문제별 블랙리스트에도 있으면 거부됐다.
   ADR-0002 는 화이트리스트가 이긴다고 정했으므로 위반이다. 우선순위를
   하드 차단 > 화이트리스트 > 문제별 블랙리스트로 확정했다.
2. **`case_count` 가 0 이면 모든 제출이 `AC` 가 됐다.** 케이스 루프가 한 번도 돌지 않고
   그대로 통과 판정으로 떨어진다. 케이스 적재에 실패한 문제에 제출하면 전원 정답이 된다.
   spec 로더가 최소 1건을 요구하도록 고쳐 `IE` 로 끊는다.

**호스트 종단 확인** (임시 스크립트, 23건 전부 통과). `make_cases.py` 는 `resource` 를
import 하지 않아 호스트에서 돌릴 수 있다. 실제 파일을 거쳐 확인한 것:
- 케이스 생성이 되고, **재생성 해시가 동일**하다 (INV-10 의 `--verify` 가 성립할 전제)
- 기준 구현이 전 케이스를 통과한다 (`AC` 경로)
- `wa.py` → `value_mismatch`, `wa_shape.py` → `shape_mismatch` 로 의도대로 갈린다
- 제출 샘플 8종이 정적 검사에서 각각 의도한 결과를 낸다
- `network.py` 가 엄격 문제에서는 정적 검사에 걸리고 느슨한 문제에서는 통과한다
  (두 방어층이 실제로 분리돼 있다는 증거)

호스트에서 만든 케이스는 삭제했다. 기대값은 채점이 실제로 도는 numpy 버전에서
나와야 한다 (호스트 2.3.4 / 컨테이너 2.4.6).

**불변식 직접 검증** (단위 테스트)
- INV-5 — 불일치 상세에 기대 수치·dict 키 이름이 실리지 않는다
- INV-7 — dtype 이 객체인 `.npy` 를 손으로 만들어 npz 에 넣으면 로더가 거부한다
- INV-4 — 격리 플래그 회귀 가드. 필수 플래그 존재, 마운트 전부 `:ro`,
  메모리와 swap 동일, `--privileged`·`--network=host`·`seccomp=unconfined` 부재
- RUNBOOK 23 — 기준 구현이 자기 문제의 제한을 통과하는지. 출제자가 제한을 잘못 걸면
  정답 코드가 `FBD` 로 떨어지고, 그 오류는 사용자가 신고하기 전까지 발견되지 않는다

`MLE` 와 `TLE` 를 가르는 분류 로직도 덮었다. cgroup OOM 도 SIGKILL 도 똑같이 137 로
나타나므로 OOM 플래그를 먼저 보지 않으면 메모리 초과가 시간 초과로 보고된다.

### 컨테이너 게이트 — 24/24 통과

~~~
$ pnpm judge:image        →  mlca-python:3.11  419MB
$ pnpm judge:fixtures     →  게이트 24건 중 24건 통과.  (exit 0)
~~~

| DoD | 검증 | 실측 |
|---|---|---|
| 1 | `judge-cli --json` 이 §4.2.3 스키마와 일치 | verdict·cases[].detail·total_runtime_ms·peak_memory_mb·error 확인 |
| 2 | 판정 8종 재현 (샘플 11건) | **8/8**. AC·WA·TLE·MLE·RE·CE·FBD·IE 전부 |
| 3 | 네트워크 차단 (INV-4) | `network.py` → `RE` / 인터페이스 `["lo"]` / 외부 접속 `OSError` |
| 4 | AST 검사가 import 보다 먼저 (INV-6) | `fbd.py` → `FBD`, 위반 2건. 최상위 `raise` 미실행 |
| 5 | 컨테이너 재사용 금지 (INV-8) | ID `52c2ed007f3a` ≠ `4bc53c7680b4`, `tmp_read.py` → `AC` |
| 7 | 기대값 비노출 (INV-5) | 기대값 후보 **300건 중 노출 0건** |
| 8 | 자원 상한 | `mle.py` → `MLE`, `tle.py` → `TLE` |
| 9 | fork 폭주 차단 | 유계 fork 루프 **62/400 성공** (상한 64) |

커널이 보고한 격리 상태 — 플래그를 넘겼다는 사실이 아니라 실제로 걸렸는지를 본다.

~~~
루트 파일시스템 쓰기 가능   false
uid                        65534
CapEff                     0000000000000000
NoNewPrivs                 1
Seccomp                    2  (filter)
~~~

정리 상태도 확인했다. 고아 컨테이너 0건, `.judge-work` 잔여 0건 — 제출 원문이 디스크에 남지 않는다.

### 컨테이너에서 확정된 것

호스트 numpy(2.3.4)와 컨테이너 numpy(2.4.6)의 케이스 해시가 다르다
(`fd274f5e…` vs `d8c5a3d1…`). 기대값을 컨테이너에서 생성해야 하는 이유가 실측으로 확인됐다.
호스트에서 만든 기대값을 썼다면 정답 제출이 `WA` 로 떨어졌을 것이다.

### DoD 6 — 게이트 문구 개정 후 통과 (2026-08-06 사용자 승인)

~~~
$ git grep -niE "allow_pickle\s*=\s*True|^\s*import\s+pickle\b|\.pkl\b" -- judge/
0건
~~~

**게이트가 실제로 무는지도 확인했다.** 세 종류 위반(`import pickle` · `allow_pickle=True` ·
`.pkl` 경로)을 러너에 심어 grep 과 단위 테스트가 각각 차단하는지 보고, 제거 후 그린
복귀까지 확인했다. 통과하는 게이트와 아무것도 안 하는 게이트는 출력이 같다.

최초 문구는 `grep "pickle\|\.pkl" judge/` 가 0건이었고 **2건**을 잡았다. 둘 다
`judge/runner/codec.py` 의 `allow_pickle=False` — 그 포맷을 **쓰는** 코드가 아니라
**끄는** 코드이며, INV-7 위반이 아니라 집행 지점이다.

개정 과정에서 같은 함정을 한 번 더 밟았다. 탐지 패턴 `\.pkl\b` 를 테스트 파일에 그대로
적었더니 탐지기가 자기 자신에 걸렸다. 패턴을 쪼개 자기 회피시켰고, 덕분에 게이트를
`judge/` 전체에 **예외 없이** 걸 수 있다. 검사 대상에서 디렉터리를 빼는 방식이었다면
그 디렉터리가 사각지대가 됐을 것이다.

**실측 데이터** (컨테이너에서 확인, 2026-08-06)

~~~
numpy 2.4.6
기본값(kwarg 생략) → ValueError: Object arrays cannot be loaded when allow_pickle=False
~~~

즉 현재 numpy 는 kwarg 없이도 객체 배열을 거부한다. 그리고 `requirements.txt` 가
`numpy==2.4.6` 으로 **정확히 고정**하므로 기본값이 몰래 바뀔 수 없다. 버전을 올리는 것은
의도적 행위이고, 그때 적대적 파일 거부 테스트가 함께 돈다.

따라서 선택지는 둘 다 안전하며 차이는 **명시성 대 게이트 문구**다.

| | kwarg 유지 (현재) | kwarg 제거 |
|---|---|---|
| 보호 근거 | 코드에 명시 | numpy 기본값 + 정확 버전 고정 |
| DoD 6 grep | 2건 (거짓 양성) | 0건 (문자 그대로 통과) |
| numpy 상향 시 | 자동으로 안전 | 적대적 파일 테스트가 잡아냄 |

**채택: 게이트 문구를 개정하고 코드의 명시적 방어는 유지한다** (2026-08-06 사용자 승인).
보호 근거를 코드에서 지우는 쪽은 게이트를 위한 거래이지 안전을 위한 거래가 아니다.

개정된 DoD 6:
1. `judge/` 에서 그 포맷을 **활성화**하는 사용이 0건 (`allow_pickle=True` 금지)
2. dtype 이 객체인 적대적 `.npz` 를 로더가 거부하는 테스트 통과

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
