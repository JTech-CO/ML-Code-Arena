# FILE_TREE — 디렉터리 구조와 모듈 경계

> INV-3의 근거 문서. 경계 규칙은 eslint `import/no-restricted-paths`로 강제한다.

## 1. 디렉터리 트리

~~~
ml-code-arena/
├── apps/
│   ├── web/                React 18 + Vite + Zustand
│   │   └── src/{routes,components,stores,styles}
│   ├── api/                Fastify
│   │   └── src/{routes,db,auth,queue,sse}
│   └── worker/             Node 채점 워커
│       └── src/{consumer,sandbox,result}
├── packages/
│   └── shared/             타입·판정 상수·스키마 (순수, 의존 없음)
│       └── src/{verdict,schema,constants}
├── judge/                  Python — JS 워크스페이스 밖
│   ├── image/Dockerfile
│   ├── runner/{runner,spec,ast_check,compare}.py
│   └── fixtures/           판정 8종 재현 샘플
├── problems/
│   └── <NNNN-slug>/
│       ├── problem.json
│       ├── statement.md
│       ├── reference.py    정답 구현(비공개)
│       ├── generator.py    케이스 생성
│       └── cases/          .gitignore 대상(INV-2)
├── tools/
│   ├── check-boundaries.js 경계 룰 실효 검증(INV-3) — M0
│   ├── problem-sync.js     문제 적재·검증 CLI
│   ├── judge-cli.js        로컬 채점 CLI
│   ├── batch-judge.js      전 문제 일괄 채점
│   ├── contrast-check.js   토큰 대비 검사(INV-12)
│   └── design-lint.js      금지 패턴 점검
├── .github/workflows/      CI — 빌드·타입체크·린트·테스트·경계 검증
└── harness/                이 팩
~~~

루트 설정 파일: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `eslint.config.js`,
`.gitignore`, `.npmrc`, `.nvmrc`, `.env.example`, `CLAUDE.md`(→ `harness/CLAUDE.md` 참조).

각 패키지는 `tsconfig.json`으로 `tsconfig.base.json`을 확장한다. 타입체크는 JSDoc + `checkJs`이며
산출물을 만들지 않는다(`noEmit`).

## 2. 패키지별 책임

| 패키지 | 책임 | 하지 않는 것 |
|---|---|---|
| `apps/web` | 화면·상태·SSE 구독 | 채점 로직, DB 접근 |
| `apps/api` | HTTP 계약·인증·큐 투입·조회 | 채점 실행, 컨테이너 조작 |
| `apps/worker` | 큐 소비·컨테이너 실행·결과 기록 | HTTP 라우팅, 인증 |
| `packages/shared` | 판정 코드·응답 스키마·상수 | 부수효과, 외부 의존 |
| `judge/runner` | 컨테이너 안 채점 실행 | 네트워크·DB 접근(INV-4) |
| `tools` | 개발·운영 CLI | 런타임 경로에 포함되지 않음 |

## 3. 경계 규칙

강제 수단은 두 가지를 함께 쓴다. 하나만으로는 한쪽 우회 경로가 열린다.

| 우회 경로 | 강제 룰 |
|---|---|
| 상대 경로 (`../../api/src/server.js`) | `import/no-restricted-paths` (해석된 파일 경로 기준) |
| 패키지 이름 (`@mlca/api`) | `no-restricted-imports` (스펙시파이어 기준) |

`packages/shared`의 외부 의존 금지는 `import/no-extraneous-dependencies`가 추가로 막는다.

| from → to | 허용 | 비고 |
|---|---|---|
| `apps/web` → `packages/shared` | 허용 | 타입·판정 상수만 |
| `apps/web` → `apps/api` \| `apps/worker` | **금지** | HTTP로만 통신 |
| `apps/api` → `packages/shared` | 허용 | |
| `apps/api` → `apps/worker` | **금지** | 큐로만 통신 |
| `apps/api` → `apps/web` | **금지** | |
| `apps/worker` → `packages/shared` | 허용 | |
| `apps/worker` → `apps/api` \| `apps/web` | **금지** | |
| `packages/shared` → 무엇이든 | **금지** | 순수 유지 |
| 모든 JS → `judge/` | **금지** | 워커는 파일 경로·컨테이너로만 접촉 |
| `judge/runner` → 외부 네트워크 | **금지** | INV-4 |

## 4. 공유 계층 정의

`packages/shared`만이 공유 계층이다. 앱 간에 공유하고 싶은 것이 생기면 여기로 올린다. 앱끼리 직접 참조하는 우회는 금지한다.

**판정 코드는 반드시 여기에 단일 정의**한다. 러너(Python)는 언어가 달라 재구현이 불가피하므로, 판정 코드 목록의 일치를 테스트로 강제한다.
