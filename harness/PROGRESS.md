# PROGRESS.md — 상태 인계 (매 세션 갱신)

> 이 팩에서 **매 세션 바뀌는 유일한 파일**. 세션이 끊겨도 이 파일만 읽으면 이어서 작업 가능해야 한다.

## 현재 상태
- **현재 phase**: M2 완료 → **M3(데이터 모델 + API + 인증) 진입 가능**
- **상태**: **M0·M1·M2 전부 DoD 통과.** M1 컨테이너 게이트 25/25, M2 DoD 7/7, M0 게이트 5/5.
- **마지막 갱신**: 2026-08-06, M0+M1+M2 구현 세션
- **저장소 경로**: `C:\Users\MSI\Desktop\ml-code-arena` — **비ASCII 경로로 되돌리지 말 것**
  (pnpm 네이티브 링커가 죽는다. 아래 막힘 기록)

**한 줄 요약**: 제출이 큐를 타고 격리 컨테이너에서 채점되어 DB 에 기록되기까지가 완성됐다.
HTTP 계층만 없다. 워커를 채점 도중 죽여도 회수되고 중복 결과가 생기지 않는다.

## 직전에 끝낸 것
- 기술/디자인 백서 Phase 1 v0.1.0, 작업 하네스 팩 인스턴스화 (이전 세션)
- **M0 완료** (이번 세션)
  - `git init` + 초기 커밋 3건 (워크스페이스 / 린트·타입 / CI·문서)
  - 저장소를 ASCII 경로로 이전 (`.git` 포함) — pnpm 크래시 해소
  - pnpm 워크스페이스: `apps/{web,api,worker}` + `packages/shared`
  - `packages/shared` — 판정 8종 단일 정의 + Phase 1 계약 상수 + 러너/API 스키마 타입
  - `apps/api` — Fastify + `/health`, 본문 상한을 `SOURCE_MAX_BYTES` 에서 유도
  - `apps/worker` — 설정 로드 스텁 (큐 소비는 M2)
  - `apps/web` — Vite + React 18, 판정 8종 표시 확인용 임시 화면 (스타일 없음, M4 에서 토큰)
  - eslint 경계 룰 — `import/no-restricted-paths` + `no-restricted-imports` 이중 강제
  - JSDoc + `checkJs` 타입체크 (`tsconfig.base.json`, `paths` 로 shared 소스 직접 매핑)
  - `tools/check-boundaries.js` — 위반 샘플 8건 생성→린트→차단 확인→삭제 자동화
  - `.gitignore`(INV-1·INV-2), `.env.example`, `.nvmrc`, `.npmrc`
  - `.github/workflows/ci.yml` — 빌드·타입체크·린트·테스트·경계 검증·시크릿 제외 확인
  - `harness/docs/FILE_TREE.md` v0.2.0 — 경계 강제 수단 2종 명시, 신규 파일 반영

## 다음 할 일
1. **M3(데이터 모델 + API + 인증/익명 세션) 진입.** `phases/M3_data_api_auth.md`.
2. M3 작업 시 주의:
   - **스키마 절반은 이미 있다.** `migrations/0001` 이 users·anon_sessions·problems·
     submissions·solved 를, `0002` 가 집계 뷰와 `judging_at` 을 만든다. M3 는 concepts·
     tags·testcases 를 `0003` 으로 추가하면 된다. 마이그레이션 도구 결정은 ADR-0008 로 끝났다.
   - **제출 접수 로직을 워커에서 가져오지 말 것.** `apps/api` 는 `apps/worker` 를 import 할
     수 없다(INV-3). API 는 자기 큐 생산자와 DB 풀을 갖는다. 공유되는 것은
     `QUEUE_NAMES`·`QUEUE_PREFIX`·`JOB_OPTIONS` 같은 계약뿐이며 `packages/shared` 에 있다.
   - 큐 작업 페이로드는 **제출 ID 하나**다 (`JudgeJob`). 소스를 실으면 재시도가 옛 데이터로
     돌고 Redis 가 제출 원문 사본을 들게 된다.
   - `queuePosition()` 이 `apps/worker/src/result/submissions.js` 에 있다. API 가 202 응답의
     `queue_position` 을 만들 때 같은 정의를 쓰되, 경계상 코드를 재구현해야 한다.
3. 미해결: Docker rootless 운용 여부 (ADR-0007 후보). 워커에 Docker 소켓을 주는 것은
   사실상 호스트 루트 권한이다. M7 배포 설계 전에는 정해야 한다.

## M1 확정 게이트 (재실행 명령)
~~~bash
pnpm judge:image        # mlca-python:3.11  419MB
pnpm judge:fixtures     # 게이트 24건 — 판정 8종 + 격리 불변식 + 커널 상태
~~~

## M1 구현 시 확정한 것 (이후 phase 가 의존)
- **러너 출력 스키마에 최상위 `detail` 추가.** `CE`·`FBD` 는 케이스를 하나도 실행하지
  않아 케이스 배열에 상세를 실을 자리가 없다. 백서 §4.2.3 과
  `packages/shared/src/schema/index.js` 를 함께 갱신했다.
- **러너는 `/opt/mlca/runner` 에 별도 볼륨으로 붙인다.** `/judge` 에는 제출·명세·케이스만
  둔다. 러너는 저장소 원본 한 부만 존재한다.
- **AST 검사 우선순위**: 하드 차단(`os`·`subprocess` 등) > `allowed_imports` 화이트리스트
  > 문제별 블랙리스트. ADR-0002 의 "화이트리스트 우선"을 지키되, 문제 정의의 실수 하나가
  격리 전제를 무너뜨리지 않게 하드 차단을 위에 둔다.
- **`allowed_imports` 는 부재와 빈 목록을 구분한다.** 부재 = 화이트리스트 미사용,
  `[]` = 아무 것도 허용 안 함. 같게 다루면 실수로 비운 화이트리스트가 조용히 무제한이 된다.
- **격리 옵션은 `apps/worker/src/sandbox/options.js` 한 곳**. CLI 와 큐 워커가 같은 함수를
  쓴다. 로컬에서 통과한 것이 운영에서 다르게 돌면 안 된다.
- **`--rm` 을 쓰지 않는다.** OOM 여부는 `docker inspect` 로만 알 수 있는데 `--rm` 은
  조회 대상을 없앤다. 대신 `finally` 에서 반드시 지운다 (INV-8).

## 결정된 것 (이번 세션)
- **ADR-0008 — 마이그레이션을 평문 SQL + 최소 러너로.** 백서 §6.1 이 이미 완성된 DDL 이라
  라이브러리 DSL 로 옮기면 백서와 코드가 서로 다른 언어로 같은 것을 두 번 말하게 된다.
  M3 의 DoR 이 잡아둔 결정을 M2 가 필요로 해서 앞당겼다.
- **큐 이름은 접두사와 이름으로 나눈다.** BullMQ 가 이름의 `:` 를 금지한다(내부 키 구분자).
  `QUEUE_PREFIX='judge'` + `QUEUE_NAMES.fast='fast'` → Redis 키 `judge:fast:*` 로
  ADR-0001 이 적은 모양이 유지된다. 합쳐진 이름은 테스트가 확인한다.
- **`msgpackr-extract` 빌드 스크립트 거부.** bullmq 의 선택적 네이티브 가속기이고
  없으면 순수 JS 로 폴백한다. 필요 없는 네이티브 빌드는 필요 없는 공격면이다.
- **DoD 6 게이트 문구 개정** — 존재가 아니라 **활성화**를 본다.
  `allow_pickle=False` 는 INV-7 위반이 아니라 집행 지점이다. 단순 문자열 검색은
  집행 코드를 위반으로 오인하고, 그걸 피하려고 명시적 방어를 지우면 보호가 기본값에
  의존하게 된다. `INVARIANTS.md` INV-7 검증란과 CI 에 함께 반영했다.

## 미결 질문 / 사용자 결정 대기
- **환경 편차** — 로컬 Node v25.2.0(문서 22 LTS) / pnpm 11.5.3(문서 9.x).
  `engines` 는 `node>=22`·`pnpm>=9`, `.nvmrc` 와 CI 는 22 로 고정했다. 백서를 올릴지
  로컬을 22 로 내릴지는 미정. M0 게이트에는 영향이 없었다.
- 배포 대상 호스트 사양 미확정 (워커 동시성 4를 전제로 최소 4코어 필요).
- 도메인 미확정.
- Docker rootless 운용 여부 — ADR-0007 후보. 현재는 소켓 마운트 전제이며, 이 결정은
  M2 진입 전 확정이 바람직하다.
- 구 폴더 `C:\Users\MSI\Desktop\내 폴더\대형 프로젝트\ML Code Arena` 는 비어 있으나
  세션 쉘이 점유 중이라 삭제되지 않았다. 세션 종료 후 지우면 된다.

## 증거 로그 (최근 게이트 실행)
저장소 루트에서 `pnpm install --frozen-lockfile` 후 실행. 5개 게이트 연속 `TOTAL_FAILURES=0`.

| phase | 게이트 | 명령 | 결과/수치 | 일시 |
|---|---|---|---|---|
| M0 | DoD 1 빌드 | `pnpm build` | PASS · vite 7.3.6, 30 modules, 144.47 kB (gzip 46.89 kB) | 2026-08-06 |
| M0 | DoD 1 타입체크 | `pnpm typecheck` | PASS · shared·web·worker·api 4/4 Done | 2026-08-06 |
| M0 | DoD 1 린트 | `pnpm lint` | PASS · 에러 0건 | 2026-08-06 |
| M0 | DoD 2·3 경계(INV-3) | `pnpm check:boundaries` | PASS · 위반 샘플 8/8 차단, 잔여 파일 0 | 2026-08-06 |
| M0 | DoD 4 시크릿(INV-1) | `git check-ignore -v .env` | PASS · `.env` 무시 / `.env.example` 추적 | 2026-08-06 |
| M0 | DoD 5 판정 8종 | `pnpm test` | PASS · 13/13 (백서 §4.3 표와 순서까지 대조) | 2026-08-06 |
| M1 | 이미지 빌드 | `pnpm judge:image` | PASS · mlca-python:3.11 419MB | 2026-08-06 |
| M1 | DoD 1~5·7~9 | `pnpm judge:fixtures` | PASS · **게이트 24/24** | 2026-08-06 |
| M1 | DoD 2 판정 8종 재현 | 위 | PASS · **8/8** (샘플 11건) | 2026-08-06 |
| M1 | DoD 3 네트워크(INV-4) | 위 | PASS · 인터페이스 `["lo"]`, 외부 접속 OSError | 2026-08-06 |
| M1 | DoD 4 검사 순서(INV-6) | 위 | PASS · `fbd.py`→FBD, 최상위 raise 미실행 | 2026-08-06 |
| M1 | DoD 5 컨테이너(INV-8) | 위 | PASS · ID 상이, `/tmp` 미노출 | 2026-08-06 |
| M1 | DoD 7 기대값 비노출(INV-5) | 위 | PASS · 후보 300건 중 노출 **0건** | 2026-08-06 |
| M1 | DoD 8 자원 상한 | 위 | PASS · MLE·TLE 재현 | 2026-08-06 |
| M1 | DoD 9 fork 차단 | 위 | PASS · 62/400 성공 (상한 64) | 2026-08-06 |
| M1 | DoD 6 직렬화(INV-7) | `git grep -niE "allow_pickle=True\|import pickle\|\.pkl" judge/` | PASS · 0건. 위반 3종 심어 탐지 확인 후 제거 | 2026-08-06 |
| M2 | DoD 1 수렴·유실 | `bench:submit --count 20` | PASS · 20/20 DONE, 유실 0 | 2026-08-06 |
| M2 | DoD 2 동시성 | 위 (`docker ps` 외부 관측) | PASS · 동시 컨테이너 **최대 4** (표본 57) | 2026-08-06 |
| M2 | DoD 3 크래시 복구 | 벤치 중 워커 SIGKILL → 재기동 | PASS · 고아 4건 회수, 12/12 AC, 중복 0 | 2026-08-06 |
| M2 | DoD 4 IE 재시도 | `bench:submit --induce-ie` | PASS · 시도 3회 후 IE 확정, JUDGING 갇힘 0 | 2026-08-06 |
| M2 | DoD 5 IE 집계 제외 | `problem_stats` · `user_ranking` 뷰 | PASS · judged=0 excluded=3, solved 미기록 | 2026-08-06 |
| M2 | DoD 6 큐 지연 | `bench:submit --count 20 --paced` | PASS · **P95 8ms** (게이트 2000ms) | 2026-08-06 |
| M2 | DoD 7 컨테이너(INV-8) | 위 | PASS · 20건 처리 후 잔존 **0** | 2026-08-06 |

## 막힘 기록 (STOP 발동 시)

### 2026-08-06 — Docker 데몬 미기동으로 M1 게이트 실행 불가
- **증상**: `docker version` 이 `npipe:////./pipe/dockerDesktopLinuxEngine` 에 연결 실패.
  CLI 는 29.6.2 로 설치돼 있고 `docker-desktop` WSL 배포판은 `Stopped`.
- **시도 (전부 실패)**: `Docker Desktop.exe` 직접 기동 2회 — 프로세스가 남지 않음 /
  `Start-Service com.docker.service` — "Cannot open service" (권한 거부).
- **판단**: Docker Desktop 은 사용자의 대화형 세션에서 떠야 한다. 에이전트 프로세스에서
  띄울 수 없는 **외부 제약**이다 (HARNESS.md §2.1).
- **그동안 한 것**: Docker 가 필요 없는 부분을 전부 끝냈다.
  - 단위 테스트 88건 (Python 46 + JS 42) 통과. **실제 버그 2건**을 잡았다 —
    화이트리스트 우선순위, 그리고 **케이스 0건일 때 모든 제출이 `AC` 가 되는 것**.
  - 호스트 종단 확인 23건 — 케이스 생성·INV-10 해시 재현·직렬화 왕복·정적 검사·비교.
  - INV-4 격리 플래그 회귀 가드를 테스트로 고정. 플래그가 사라지면 커밋 시점에 드러난다.
  - M0 게이트 5종도 M1 코드 추가 후 전부 그린.
- **해소 방법**: 사용자가 Docker Desktop 실행 → `pnpm judge:image && pnpm judge:fixtures`.
- **남은 미검증 경로**: `runner.py` 의 main 흐름(Linux 전용이라 호스트 실행 불가),
  컨테이너 오케스트레이션, 실제 격리 동작(INV-4·INV-8), `TLE`·`MLE` 실측, pids-limit.

### 2026-08-06 — 비ASCII 저장소 경로에서 `pnpm install` 네이티브 크래시 → **해결(경로 이전)**
- **증상**: 링크 단계에서 종료 코드 `-1073740791`(`0xC0000409`, STATUS_STACK_BUFFER_OVERRUN).
  `node_modules/.pnpm` 은 생기지만 최상위 `node_modules` 링크가 없어 게이트를 못 돌린다.
- **시도 (전부 실패, 동일 크래시)**: node_modules 전체 삭제 후 재설치 /
  `--node-linker=hoisted` / `--package-import-method=copy` / pnpm 11.20.0.
- **원인 좁히기**: 한글 경로+소량 의존성=성공, ASCII+공백=성공, Desktop 하위 ASCII=성공,
  ASCII+전체 의존성=성공, **한글 경로+전체 의존성(319 패키지)=크래시**.
  → Desktop·OneDrive·공백·경로 길이·pnpm 버전·링커 모드 전부 원인 아님.
  **비ASCII 경로 × 이 의존성 집합**의 조합에서만 pnpm 네이티브 링커가 죽는다.
- **조치**: 저장소를 `C:\Users\MSI\Desktop\ml-code-arena` 로 이전(사용자 승인). 즉시 해소.
  **저장소를 다시 비ASCII 경로로 옮기면 재발한다.**
- **부수 발견**: pnpm 11 은 `pnpm-workspace.yaml` 을 스스로 다시 쓰면서 **비ASCII 주석을 깨뜨린다.**
  이 파일은 ASCII 로만 유지한다. 빌드 스크립트 허용 키도 pnpm 10 의 `onlyBuiltDependencies` 가
  아니라 pnpm 11 의 `allowBuilds` 다.

## 결정 로그
- 최근 결정은 `decisions/`. 요약:
  - 0001 — 채점을 큐 기반 비동기로 한다
  - 0002 — `structural`을 `tolerance`의 전제 조건으로 둔다
  - 0003 — 테스트케이스 직렬화에 pickle 대신 `.npz`/JSON을 쓴다
  - 0004 — 세션을 JWT 대신 서버 세션 쿠키로 한다
  - 0005 — 익명 제한을 완전 차단이 아닌 전환 마찰로 설계한다
  - 0006 — `prefers-color-scheme`을 자동 적용하지 않고 라이트를 기본값으로 고정한다
- M0 에서 ADR 을 남길 만한 결정은 없었다. 판단 근거는 `phases/M0_scaffolding.md` 리스크 절에 기록.
