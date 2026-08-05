# PROGRESS.md — 상태 인계 (매 세션 갱신)

> 이 팩에서 **매 세션 바뀌는 유일한 파일**. 세션이 끊겨도 이 파일만 읽으면 이어서 작업 가능해야 한다.

## 현재 상태
- **현재 phase**: M0 완료 → **M1(채점 러너) 진입 가능**
- **상태**: M0 DoD 5/5 통과, 저장소 경로에서 재현 확인
- **마지막 갱신**: 2026-08-06, M0 구현 세션
- **저장소 경로**: `C:\Users\MSI\Desktop\ml-code-arena` — **비ASCII 경로로 되돌리지 말 것**
  (pnpm 네이티브 링커가 죽는다. 아래 막힘 기록)

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
1. **M1(채점 러너) 진입.** 전체 계약의 원점이므로 서두르지 않는다. `phases/M1_judge_runner.md`.
   - DoR 확인: Docker 이미지 빌드 가능 환경 (Docker 29.6.2 설치 확인됨)
   - `docs/TECHNICAL.md` §4(채점 엔진)·§5(격리) 정독
   - INV-4·INV-5·INV-6·INV-7·INV-8
2. M1 작업 시 주의:
   - `packages/shared/src/schema/index.js` 의 `RunnerOutput` 은 백서 §4.2.3 을 옮긴 것이다.
     러너 구현이 확정되면 **이 파일과 대조**하고 어긋나면 백서와 함께 갱신한다.
   - 판정 8종 목록은 `packages/shared` 가 단일 출처다. Python 러너는 재구현이 불가피하므로
     **목록 일치를 테스트로 강제**할 것 (`docs/FILE_TREE.md` §4).
   - 격리 옵션(`docker run` 플래그)은 **단일 상수 모듈 한 곳**에만 둔다.
     실행 제한 수치는 이미 `packages/shared` 의 `EXECUTION_LIMITS` 에 있다. 재선언하지 말 것.
   - `AC` 만 확인하고 넘어가지 않는다. 판정 8종 전부 재현이 게이트다.
3. M2 진입 전 결정: Docker rootless 운용 여부 (ADR-0007 후보), Postgres 16 · Redis 7 준비.

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

## 막힘 기록 (STOP 발동 시)

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
