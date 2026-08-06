# ML Code Arena

AI/머신러닝/딥러닝 알고리즘을 **라이브러리 없이 직접 구현하게 하는** 온라인 저지 플랫폼.

Phase 1 은 Python 단일 언어 · CPU 전용 · `tolerance`+`structural` 2개 채점 모드 · 문제 30개로 한정한다.

## 무엇이 다른가

`numpy.linalg.norm` 한 줄로 풀리는 문제는 "L2 노름을 구현하라"는 문제가 아니다.
모든 문제는 **허용 import 화이트리스트**를 갖고, 제출은 사용자 코드를 `import` 하기
**전에** AST 로 검사된다 (INV-6). 라이브러리를 부르는 풀이는 실행되지 않고 `FBD`
(Forbidden) 판정을 받는다.

제한을 걸어 두는 것과 그 제한이 실제로 무는 것은 다른 명제다. 그래서 문제마다
`bypass.py`(라이브러리 한 줄 풀이)를 함께 두고, CI 가 **30문제 전부에 대해 `FBD` 를
받는지** 확인한다. 같은 CI 가 기준 구현 30건이 `AC` 를 받는지도 함께 본다 — 한쪽만
보면 "제한이 너무 느슨한 문제"나 "정답까지 막는 문제"가 그대로 통과한다.

## 현재 상태

**M7 완료 — Phase 1 전 구간 구현·검증 완료.** 진행 상황은
[`harness/PROGRESS.md`](harness/PROGRESS.md) 가 정본이다.

| phase | 이름 | 상태 |
|---|---|---|
| M0 | 기반/스캐폴딩 | 완료 |
| M1 | 채점 러너 + 격리 컨테이너 ★ | 완료 (게이트 25/25) |
| M2 | 큐 + 워커 + 결과 반영 | 완료 (7/7) |
| M3 | 데이터 모델 + API + 인증/익명 세션 | 완료 (10/10) |
| M4 | 디자인 토큰 + AppShell | 완료 (8/8) |
| M5 | 프론트엔드 3트랙 | 완료 (12/12) |
| M6 | 문제 30개 + 개념 문서 ★ | 완료 (9/9) |
| M7 | 운영/배포/CI | 완료 (9/9) |

실제 서버 배포는 호스트 확보 후다. 배포 스택은 완성되어 있고 절차는
[`harness/docs/ENVIRONMENT.md`](harness/docs/ENVIRONMENT.md) §7 에 있다.

## 채점 격리

제출은 제출당 하나씩 만들어지는 컨테이너에서 돌고 즉시 파기된다 (INV-8).

~~~
--network=none          외부 접속 불가. Phase 1 에 예외가 없다 (INV-4)
--read-only             쓰기 가능한 곳은 noexec tmpfs 하나뿐
--memory=512m           swap 동일 — 스왑으로 우회 불가
--pids-limit=64         fork 폭탄 차단
--user=65534:65534      비특권
--cap-drop=ALL          capability 전부 제거
--security-opt=no-new-privileges
~~~

기대값은 API 응답·에러 메시지·로그 어디에도 나가지 않는다 (INV-5). 오답 피드백에 담기는
것은 shape·길이·타입 이름까지다.

이 항목들은 문서가 아니라 게이트다 — `pnpm judge:fixtures` 가 컨테이너 안에서 커널 상태를
직접 읽어 25건을 확인한다.

## 구조

~~~
apps/web       React 18 + Vite + Zustand — 화면·상태·SSE 구독
apps/api       Fastify — HTTP 계약·인증·큐 투입·조회
apps/worker    Node — 큐 소비·컨테이너 실행·결과 기록
packages/shared 판정 코드·상수·스키마 타입 (순수, 외부 의존 없음)
judge/         Python 채점 러너 — JS 워크스페이스 밖
problems/      문제 정의
tools/         개발·운영 CLI
harness/       작업 하네스 + 백서
~~~

앱끼리 직접 import 하지 않는다. 공유는 `packages/shared` 만 거친다. 경계 규칙은
[`harness/docs/FILE_TREE.md`](harness/docs/FILE_TREE.md) §3 이며 eslint 로 강제된다(INV-3).

## 시작하기

사전 요구는 [`harness/docs/ENVIRONMENT.md`](harness/docs/ENVIRONMENT.md) §1.

~~~bash
pnpm install
cp .env.example .env      # 값을 채운다. .env 는 커밋하지 않는다 (INV-1)
pnpm dev                  # web + api + worker 동시 기동
~~~

문제를 적재하려면 Docker 가 필요하다. 기대값은 **채점이 도는 것과 같은 컨테이너**에서
만들어진다 (INV-10) — 호스트 numpy 로 만들면 버전 차이가 곧 정답의 `WA` 가 된다.

~~~bash
pnpm judge:image          # 채점 이미지 mlca-python:3.11
pnpm db:up && pnpm db:migrate
pnpm problems:sync        # 문제 30개 + 개념 22건 적재 (케이스는 컨테이너에서 생성)
~~~

## 검증

~~~bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
pnpm check:boundaries     # 의도적 위반 샘플로 경계 룰 실효 확인 (INV-3)
pnpm check:contrast       # 라이트·다크 전 조합 4.5:1 (INV-12)
pnpm check:design         # 색 리터럴이 tokens.css 밖에 있는지

pnpm judge:fixtures       # 판정 8종 + 격리 불변식 — 게이트 25건
pnpm problems:verify      # 기대값 재생성 해시 대조 (INV-10)
pnpm judge:batch -- --source reference   # 30/30 AC
pnpm judge:batch -- --source bypass      # 30/30 FBD
~~~

`pnpm test` 는 `<db>_test` 접미사 데이터베이스를 쓴다. 테스트가 매번 `TRUNCATE` 하므로
개발·운영 DB 를 대상으로 돌지 않도록 이름을 검사하고 거부한다.

## 배포

단일 리눅스 호스트. 절차는 [`harness/docs/ENVIRONMENT.md`](harness/docs/ENVIRONMENT.md) §7,
구조와 근거는 [`deploy/README.md`](deploy/README.md).

~~~
호스트
├── systemd  mlca-worker.service       채점 워커 — compose 밖 (ADR-0007)
│      └── docker run mlca-python:3.11  제출 1건당 1개, 즉시 파기
└── docker compose --env-file .env -f deploy/compose.yml
       ├── caddy      :80/:443   정적 web + /api 프록시 (SSE 무버퍼)
       ├── api        :3000      내부 네트워크만
       ├── postgres   16
       └── redis      7
~~~

워커가 compose 밖에 있는 이유는 Docker 소켓이 필요하기 때문이다. 소켓을 컨테이너 안으로
넣지 않는 쪽을 골랐다 — 자세한 근거와 남은 위험은 `deploy/README.md`.

## 문서

| 문서 | 내용 |
|---|---|
| [`harness/CLAUDE.md`](harness/CLAUDE.md) | 에이전트 계약 · 레드라인 |
| [`harness/HARNESS.md`](harness/HARNESS.md) | 운영 매뉴얼 · 세션 루프 · STOP 규칙 |
| [`harness/INVARIANTS.md`](harness/INVARIANTS.md) | 불변식 INV-1~INV-12 |
| [`harness/docs/TECHNICAL.md`](harness/docs/TECHNICAL.md) | 기술 백서 |
| [`harness/docs/DESIGN.md`](harness/docs/DESIGN.md) | 디자인 백서 |
| [`harness/RUNBOOK.md`](harness/RUNBOOK.md) | 증상 → 원인 → 조치 |
