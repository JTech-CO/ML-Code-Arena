# ML Code Arena

AI/머신러닝/딥러닝 알고리즘을 **라이브러리 없이 직접 구현하게 하는** 온라인 저지 플랫폼.

Phase 1 은 Python 단일 언어 · CPU 전용 · `tolerance`+`structural` 2개 채점 모드 · 문제 30개로 한정한다.

## 현재 상태

**M0 — 기반/스캐폴딩.** 진행 상황은 [`harness/PROGRESS.md`](harness/PROGRESS.md) 가 정본이다.

| phase | 이름 | 상태 |
|---|---|---|
| M0 | 기반/스캐폴딩 | 진행 |
| M1 | 채점 러너 + 격리 컨테이너 ★ | 대기 |
| M2 | 큐 + 워커 + 결과 반영 | 대기 |
| M3 | 데이터 모델 + API + 인증/익명 세션 | 대기 |
| M4 | 디자인 토큰 + AppShell | 대기 |
| M5 | 프론트엔드 3트랙 | 대기 |
| M6 | 문제 30개 + 개념 문서 ★ | 대기 |
| M7 | 운영/배포/CI | 대기 |

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

## 검증

~~~bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm check:boundaries     # 의도적 위반 샘플로 경계 룰 실효 확인 (INV-3)
~~~

## 문서

| 문서 | 내용 |
|---|---|
| [`harness/CLAUDE.md`](harness/CLAUDE.md) | 에이전트 계약 · 레드라인 |
| [`harness/HARNESS.md`](harness/HARNESS.md) | 운영 매뉴얼 · 세션 루프 · STOP 규칙 |
| [`harness/INVARIANTS.md`](harness/INVARIANTS.md) | 불변식 INV-1~INV-12 |
| [`harness/docs/TECHNICAL.md`](harness/docs/TECHNICAL.md) | 기술 백서 |
| [`harness/docs/DESIGN.md`](harness/docs/DESIGN.md) | 디자인 백서 |
| [`harness/RUNBOOK.md`](harness/RUNBOOK.md) | 증상 → 원인 → 조치 |
