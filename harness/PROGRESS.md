# PROGRESS.md — 상태 인계 (매 세션 갱신)

> 이 팩에서 **매 세션 바뀌는 유일한 파일**. 세션이 끊겨도 이 파일만 읽으면 이어서 작업 가능해야 한다.

## 현재 상태
- **현재 phase**: M7 — **DoD 8/9 통과. DoD 2(CI 그린) 확인만 남음**
- **상태**: M0~M6 전부 DoD 통과. M7 은 배포 스택·게이트 전부 완료, CI 실행 확인 대기.
  M1 25/25 · M2 7/7 · M3 10/10 · M4 8/8 · M5 12/12 · M6 9/9 · M7 8/9 · 단위 79건.
- **마지막 갱신**: 2026-08-07, M7 배포·운영 세션
- **저장소 경로**: `C:\Users\MSI\Desktop\ml-code-arena` — **비ASCII 경로로 되돌리지 말 것**
  (pnpm 네이티브 링커가 죽는다. 아래 막힘 기록)
- **GitHub**: https://github.com/JTech-CO/ML-Code-Arena (공개). `main` 에 전체 히스토리 반영됨.

**한 줄 요약**: 배포할 수 있는 상태다. 스택(caddy·api·postgres·redis + 호스트 워커)이
서고, 클린 상태에서 문서 절차만으로 기동되며, 부하·SSE·백업복구·경보가 전부 실측으로
통과한다. **실제 리눅스 호스트만 없다.**

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
1. **CI 그린 확인 (M7 DoD 2).** 세 결함을 고쳐 `0ef548e` 로 밀었고 로컬 게이트는 전부
   통과한다. GitHub 러너 큐가 풀리면 재실행 결과만 보면 된다.
   ~~~bash
   gh run list --workflow=ci.yml --limit 1
   gh workflow run ci.yml --ref main     # 큐가 비었을 때만. 밀릴 때 여러 번 돌리면
                                         # concurrency 로 서로를 취소시킨다
   ~~~
   **`make_cases` uid 수정은 리눅스에서만 실효를 확인할 수 있다** — Windows 는 65534
   분기를 타므로 개발 기계에서 검증한 것은 로직뿐이다.
2. **GitHub Pages 를 끌 것.** 저장소에 Pages 가 켜져 있어 푸시마다 빌드가 돌고 실패한다.
   이 프로젝트는 서버가 필요해 Pages 로 서빙할 수 없다. Settings → Pages 에서 끈다.
3. **호스트 확보 후**: 실제 배포(`docs/ENVIRONMENT.md` §7), TLS·도메인, systemd 유닛
   실기동, rootless 판정(ADR-0007 재검토 조건 — `judge:fixtures` 25건 통과 여부).
4. **문제를 더 쓰거나 고칠 때 알아둘 것** — 자세한 규약은 `problems/README.md`:
   - `pnpm problems:report` 는 Docker·DB 없이 돈다. 쓰는 도중에도 돌려 볼 것.
   - `pnpm problems:sync` 가 케이스 생성부터 DB 적재까지 한다. 케이스는 **컨테이너 안에서**
     만들어진다 — 호스트 numpy 로 만들면 버전 차이로 정답이 `WA` 가 된다 (M1 실측).
   - 문제마다 `bypass.py` 가 필수다. `pnpm judge:batch -- --source bypass` 가 30/30 `FBD` 를
     요구한다. 이것이 이 플랫폼의 존재 이유다.
   - 기준 구현이 자기 제한에 걸리면 `make_cases.py` 가 케이스 생성 자체를 거부한다.
     `judge/tests` 의 `ProblemDefinitionTest` 도 `problems/` 전체를 같은 눈으로 본다.
5. ~~`pnpm test` 가 개발 DB 를 비운다~~ — **M7 에서 해결.** 테스트는 이제 `<db>_test` 를
   쓰고, 이름이 `_test` 로 끝나지 않으면 건너뛰지 않고 **거부**한다. DB 는 `pnpm test` 가
   먼저 부르는 `tools/test-db-setup.js` 가 만든다. 운영 호스트에서 테스트를 돌려도
   운영 데이터가 사라지지 않는다.
6. 남은 콘텐츠 구멍:
   - 문제 목록의 **태그 필터가 비어 있다.** 문제에 태그는 붙었지만(`problem_tags` 적재됨)
     `GET /api/problems` 가 태그를 돌려주지 않아 사이드바를 채울 수 없다.
   - **`#` 열은 디렉터리 번호가 아니다.** 목록은 `(tier, difficulty, slug)` 순이라 같은
     단계·난이도 안에서 `NNNN` 순서와 어긋난다. 출제 순서를 화면에 고정하려면
     `display_order` 컬럼이 필요하다 — 지금은 필요를 못 느껴 두지 않았다.
7. 프론트를 손볼 때 지킬 것:
   - **색을 컴포넌트에 직접 쓰지 말 것.** `pnpm check:design` 이 `.jsx`·`.css` 양쪽에서 막는다.
     새 색이 필요하면 `tokens.css` 에 넣고 `pnpm check:contrast` 를 돌린다 (INV-12).
   - `VerdictLabel` 은 색과 판정 코드 텍스트를 **항상 함께** 낸다 (INV-11).
   - 호버는 배경색 변화만. 대기는 스피너가 아니라 큐 순번 텍스트 (§9).
   - 응답 필드는 `apps/api/src/serialize.js` 통과 목록이 정한다. 필요한 필드가 없으면
     거기 추가하고, DB 행을 그대로 내보내는 우회를 만들지 말 것 (INV-5).
   - **web 과 api 는 같은 출처여야 한다.** 개발은 Vite 프록시로 맞춰 두었다.
     교차 출처면 `SameSite=Lax` 세션 쿠키가 실리지 않아 익명 한도와 계정 승계가 깨진다.
8. ~~Docker rootless 운용 여부~~ — **ADR-0007 로 결정.** 워커를 호스트 프로세스로 둔다.
   rootless 로 옮기는 판정 기준도 ADR 에 적었다 — 리눅스 호스트에서 `judge:fixtures`
   25건이 그대로 통과하는지 하나다. 통과하지 못하면 옮기지 않는다.
9. M7 이 남긴 것: `trustProxy` 신뢰 범위(지금은 `X-Forwarded-For` 미신뢰라
   프록시 뒤에서 익명 IP 가 하나로 묶인다), Redis 재기동 시 전원 로그아웃, SSE 프록시 검증,
   그리고 **web·api 동일 출처 배치**.

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

## M6 에서 확정한 것

- **AST 검사에 규칙 두 개를 더했다** — `forbidden_operators`(`@`·`**`·`//`·`%`) 와
  `forbidden_attributes` 의 `.이름` 형태. 문제를 쓰다 보니 기존 검사로는 성립하지 않는
  문제가 나왔다. `numpy.matmul` 을 전부 막아도 `a @ b` 가 남고, `numpy.mean` 을 막아도
  `x.mean()` 이 남는다. 후자가 특히 넓은 구멍이었다 — numpy 배열은 거의 모든 함수를
  메서드로도 제공하는데 `x` 는 사용자가 정한 이름이라 경로로는 잡히지 않는다.
  **경로가 이미 걸린 노드에서는 이름 규칙을 보지 않는다** — 문제 정의가 `numpy.dot` 과
  `.dot` 을 함께 거는 것이 정상인데(막는 경로가 다르다), 둘 다 보고하면 같은 줄에
  거의 같은 문장이 두 번 뜬다.
- **`bypass.py` 를 문제 정의의 필수 파일로 만들었다.** §9 레이아웃에는 없지만
  `problem-sync` 가 없으면 적재를 거부한다. 제한을 걸어 두는 것과 그 제한이 실제로
  우회를 막는 것은 다른 명제이고, 후자를 확인하지 않으면 제한 목록의 오타를 아무도 모른다.
- **기준 구현 검사를 케이스 생성 안에 넣었다.** `make_cases.py` 가 `reference.py` 를
  자기 문제의 제한으로 먼저 검사하고, 걸리면 케이스를 만들지 않는다. 모든 문제가 반드시
  거치는 관문이라 빠져나갈 자리가 없다.
- **`ProblemDefinitionTest` 가 `problems/` 전체를 본다.** 컨테이너에 `/opt/problems` 로
  붙여 호스트와 같은 상대 경로가 성립하게 했다. 넓혔다고 주장하는 대신 문제 하나를
  고의로 깨뜨려 게이트가 빨개지는 것을 확인했다.
- **허용 오차는 전 문제 기본값(`rtol 1e-5`)이다.** 문제별로 좁히는 대신 정답 구현끼리
  값이 갈릴 수 있는 입력을 케이스에서 뺐다 — 수치 미분의 극소 `h`, 조건수가 나쁜 행렬,
  1·2위 고윳값이 가까운 행렬. 허용 오차를 조이는 것은 증상 대응이고 이쪽이 원인이다.
- **`seed-dev.js` 는 더 이상 문제를 만들지 않는다.** 문제·개념의 원본은 `problems/` 이고
  시드는 랭킹 화면용 계정과 해결 기록만 넣는다. 두 곳에서 문제를 만들면 어느 쪽이
  진짜인지 알 수 없어진다. 시드 계정 비밀번호는 전부 `dev-password` 다.

## M7 에서 확정한 것

- **ADR-0007 채택 — 워커를 호스트 프로세스로.** M1 부터 미결이던 것을 닫았다. 근거는
  보안 등급이 아니라 **검증한 형태와 배포하는 형태를 같게** 두는 것이다. 격리 게이트
  25건이 전부 이 형태에서 통과했고, 워커를 컨테이너로 옮기면 통과한 적 없는 형태로
  배포하게 된다. 남은 위험(`docker` 그룹 = 루트 등가)은 없애지 못했고 두 겹으로 받쳤다.
- **`submissions.ie_reason` 추가 (migration 0005).** 백서 §13.1 이 "IE 발생 상세 영구"를
  요구하는데 그때까지 `IE` 는 이유 없이 저장됐다. `detail` 에 섞지 않은 것은 그 컬럼이
  API 로 나가기 때문이다 — 나가지 않아야 하는 값은 나갈 수 있는 컬럼에 두지 않는다.
- **테스트가 자기 DB 를 쓴다.** `<db>_test` 를 쓰고 이름이 다르면 거부한다. 개발 중
  두 번 데이터가 날아갔고, 같은 일이 운영 호스트에서 일어나면 사고다.
- **`.dockerignore` 추가.** 없어서 호스트 `node_modules` 가 이미지로 복사되고 **`.env` 가
  빌드 컨텍스트에 포함**되고 있었다. 레이어에 박힌 시크릿은 이미지를 지워도 남는다.
- **케이스 생성 컨테이너의 uid 를 호출자로.** 리눅스에서 nobody 는 마운트한 문제
  디렉터리에 쓸 수 없어 `problems:sync` 가 통째로 죽는다. 완화가 아니라 대상이 다른
  것이다 — 이 컨테이너가 도는 것은 저장소에 커밋된 우리 콘텐츠이고, 사용자 코드 경로는
  그대로 65534 다. 그 사실은 테스트가 계속 확인한다.
- **부하 시험이 두 숫자를 낸다.** §12 의 "채점 완료 P95 < 5초"는 처리량 계산에 쓰이는
  **서비스 시간**이다. 일괄 50건의 종단 시간은 큐 깊이의 함수라 어떤 구현으로도 5초를
  넘는다. 둘 다 찍어 어느 쪽이 게이트인지 숨기지 않는다.

## 결정된 것 (이전 세션)
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
- **배포 호스트 미확보.** M7 은 로컬(16코어/68GB)에서 클린 상태를 재현해 검증했다.
  실제 호스트는 4코어/8GB 이상이면 된다 (docs/ENVIRONMENT.md §6).
- 도메인 미확정.
- ~~Docker rootless 운용 여부~~ — ADR-0007 로 채택 완료 (워커를 호스트 프로세스로).
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
| M3 | DoD 1 마이그레이션 왕복 | `migrate down x3 → up` | PASS · 테이블 1→10, 뷰 2, 트리거 1 | 2026-08-06 |
| M3 | DoD 2 종단 왕복 | `pnpm e2e:api` | PASS · **6/6**. 202→AC, WA shape 대조, SSE 2건 | 2026-08-06 |
| M3 | DoD 3~10 | `pnpm --filter @mlca/api test` | PASS · **27/27** (진짜 DB·Redis) | 2026-08-06 |
| M3 | DoD 5 우회 차단(INV-9) | 위 | PASS · 헤더·본문·카운터 컬럼·쿠키 위조 전부 403 유지 | 2026-08-06 |
| M3 | DoD 9 비밀번호 | `psql` + CHECK 제약 | PASS · argon2id 3/3, 평문 삽입 시 제약 위반 | 2026-08-06 |
| M3 | DoD 10 IP | 단위 테스트 | PASS · 32바이트 HMAC 일치, 원본 컬럼 부재 | 2026-08-06 |
| 회귀 | M1·M2·M0 | `judge:fixtures` · `bench:submit` · 5종 | PASS · 25/25 · 8/8 AC · 전부 그린 | 2026-08-06 |
| M4 | DoD 1 테마 전환·지속 | 브라우저 실측 | PASS · 토글→localStorage→새로고침 유지 | 2026-08-06 |
| M4 | DoD 2 라이트 기본값 | 브라우저 실측 | PASS · **OS 가 다크인데도** 라이트로 렌더 | 2026-08-06 |
| M4 | DoD 3 FOUC 없음 | `dist/index.html` 순서 | PASS · 인라인(701) < 번들(945) < CSS(1023) | 2026-08-06 |
| M4 | DoD 4 대비(INV-12) | `pnpm check:contrast` | PASS · **112조합** 전부 4.5:1↑, 다크 배경 #16181c | 2026-08-06 |
| M4 | DoD 5 색 리터럴 | `pnpm check:design` | PASS · 위반 0건 (`.jsx`·`.css` 양쪽) | 2026-08-06 |
| M4 | DoD 6 활성 트랙 | 브라우저 실측 | PASS · 2px accent 밑줄, 볼드·배경 미사용 | 2026-08-06 |
| M4 | DoD 7 reduced-motion | CSSOM + 주입 측정 | PASS · 0.12s → 1e-05s → 복귀 | 2026-08-06 |
| M4 | DoD 8 서체 2종 | `pnpm check:design` | PASS · sans + mono | 2026-08-06 |
| M5 | DoD 1 전체 흐름 | 브라우저 실측 | PASS · 문제 선택→작성→제출→`AC` 완주 | 2026-08-06 |
| M5 | DoD 2 판정 8종 | SSE 로 8종 렌더 | PASS · 8/8, 빈 칸·undefined 0 | 2026-08-06 |
| M5 | DoD 3 ShapeDiff(INV-5) | 실제 WA 제출 | PASS · `(3,3)` vs `(9,)`, 기대 수치 없음 | 2026-08-06 |
| M5 | DoD 4 색 단독 금지(INV-11) | 위 | PASS · 판정 코드 텍스트 항상 병기 | 2026-08-06 |
| M5 | DoD 5 목록 밀도 | 1920×1080 | PASS · 행 43px, **19행 전부 노출** | 2026-08-06 |
| M5 | DoD 6 SSE·익명 제외 | 위 | PASS · 8건 수신, 익명 0건 | 2026-08-06 |
| M5 | DoD 7 개념↔문제 | API + 화면 | PASS · 양방향 1클릭 | 2026-08-06 |
| M5 | DoD 8 AnonQuotaBar | 잔여 3 상태 | PASS · 노출·닫기 동작 | 2026-08-06 |
| M5 | DoD 9 반응형 | 1280/1024/768/375 | PASS · 전 라우트 가로 스크롤 0 | 2026-08-06 |
| M5 | DoD 10 키보드 | 브라우저 실측 | PASS · 방향키·Enter·**Ctrl+Enter 제출** | 2026-08-06 |
| M5 | DoD 11 스크린리더 | DOM | PASS · `role=status` `aria-live=polite` | 2026-08-06 |
| M5 | DoD 12 금지 목록 | `pnpm check:design` | PASS · 47파일 위반 **0건** | 2026-08-06 |
| M6 | DoD 1 적재·렌더 | `pnpm problems:sync` + 브라우저 | PASS · 30건 공개, 목록 `30 / 30` | 2026-08-07 |
| M6 | DoD 2 기준 구현 | `judge:batch --source reference` | PASS · **30/30 AC** · 21.4s | 2026-08-07 |
| M6 | DoD 3 기대값 재현(INV-10) | `problem-sync --all --verify` | PASS · **30/30 해시 일치** | 2026-08-07 |
| M6 | DoD 4 제한 필수 | `problem-sync --report` + API | PASS · 허용 목록 빈 문제 **0건** | 2026-08-07 |
| M6 | DoD 5 우회 차단 | `judge:batch --source bypass` | PASS · **30/30 FBD** · 18.1s | 2026-08-07 |
| M6 | DoD 6 실행 시간 | 위 verify 의 `reference_ms` | PASS · **최장 12ms** (상한 1000ms) | 2026-08-07 |
| M6 | DoD 7 공개 예제 | `problem-sync --report` | PASS · `## 예제` 절 30/30 | 2026-08-07 |
| M6 | DoD 8 개념 양방향 | SQL + `/api/concepts/*` | PASS · 링크 36건, 개념 없는 문제 **0** | 2026-08-07 |
| M6 | DoD 9 단계 분포 | `problem-sync --report` | PASS · **10 / 8 / 7 / 5** | 2026-08-07 |
| M6 | 회귀 M1 | `pnpm judge:fixtures` | PASS · 게이트 **25/25**, 단위 51건 | 2026-08-07 |
| M6 | 검사 범위 실증 | 문제 1건 고의 파손 → 복원 | PASS · FAIL 재현 후 복원 시 PASS | 2026-08-07 |
| M7 | DoD 1 클린 기동 | 볼륨 삭제 후 문서 §7 절차만 | PASS · **결함 3건 검출**(compose env-file · /health 폴백 · index 캐시) | 2026-08-07 |
| M7 | DoD 2 CI | GitHub Actions | **대기** · 첫 실행이 리눅스 결함 3건 검출, 수정 푸시 후 러너 큐 적체 | 2026-08-07 |
| M7 | DoD 3 부하 50건 | `bench-submit --count 50 --concurrency 50` | PASS · 유실 0 · 채점 P95 **2721ms** · IE 0.00% · 잔존 0 | 2026-08-07 |
| M7 | DoD 4 SSE 6분 | `sse-soak --minutes 6` | PASS · 재연결 **0회** · 하트비트 24/24 · 최대 침묵 15.0s | 2026-08-07 |
| M7 | DoD 5 지표 4종 | `ops-metrics --window 1h` | PASS · 큐·판정·워커·전환율 전부 실측 | 2026-08-07 |
| M7 | DoD 6 IE 경보 | IE 유도 후 `ops-metrics --check` | PASS · **3경로 전부**(stderr·웹훅·종료코드 1) + 사유 표시 | 2026-08-07 |
| M7 | DoD 7 백업·복구 | `db-backup --verify` | PASS · 테이블 10개 · **행 224개 일치** | 2026-08-07 |
| M7 | DoD 8 시크릿(INV-1) | 이미지·히스토리·compose 검사 | PASS · 이미지 0건 · 레이어 0건 · caddy 는 DB 비밀번호 모름 | 2026-08-07 |
| M7 | DoD 9 최소권한 | `docker inspect` + 구조 검사 | PASS · ReadonlyRootfs·CapDrop ALL·uid 1000 · 구조 4/4 | 2026-08-07 |
| M7 | 구조 검사 실증 | 워커에 `spawn(python)` 심기 → 복원 | PASS · FAIL 재현 후 복원 시 4/4 | 2026-08-07 |

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
