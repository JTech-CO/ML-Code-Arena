# PROGRESS.md — 상태 인계 (매 세션 갱신)

> 이 팩에서 **매 세션 바뀌는 유일한 파일**. 세션이 끊겨도 이 파일만 읽으면 이어서 작업 가능해야 한다.

## 현재 상태
- **현재 phase**: M1 — 채점 러너 + 격리 컨테이너 ★
- **상태**: **DoD 9개 중 8개 통과.** 컨테이너 게이트 24/24, M0 게이트 5/5.
  DoD 6 만 게이트 문구 결정 대기 (구현은 안전한 쪽으로 완료)
- **마지막 갱신**: 2026-08-06, M0+M1 구현 세션
- **저장소 경로**: `C:\Users\MSI\Desktop\ml-code-arena` — **비ASCII 경로로 되돌리지 말 것**
  (pnpm 네이티브 링커가 죽는다. 아래 막힘 기록)

**한 줄 요약**: 채점기가 CLI 만으로 완결된다. 판정 8종이 전부 재현되고 격리 불변식
4건(INV-4·INV-5·INV-6·INV-8)이 커널 상태로 확인됐다. M2 진입 가능.

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
1. **[사용자 결정] DoD 6 게이트 문구** — `phases/M1_judge_runner.md` 증거 절 참조.
   grep 이 INV-7 을 **집행하는** 코드에 걸린다(거짓 양성). 실측 결과 kwarg 를 빼도
   현재 numpy 는 객체 배열을 거부하고 버전이 정확히 고정돼 있어 두 선택지 모두 안전하다.
   차이는 명시성 대 게이트 문구다. 코드는 안전한 쪽으로 두고 게이트는 손대지 않았다.
2. M2(큐 + 워커) 진입. `apps/worker/src/sandbox/` 는 이미 M1 에서 완성돼 있으므로
   M2 는 큐 소비와 결과 기록만 붙이면 된다. `runInSandbox()` 가 그대로 재사용된다.
3. M2 진입 전 결정: Docker rootless 운용 여부 (ADR-0007 후보), Postgres 16 · Redis 7 준비.

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
| M1 | DoD 6 (INV-7) | `git grep pickle judge/` | **보류** · 2건은 INV-7 집행 코드(거짓 양성) | 2026-08-06 |

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
