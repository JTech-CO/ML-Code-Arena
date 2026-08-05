# ENVIRONMENT — 로컬·CI 셋업

## 1. 사전 요구

| 도구 | 버전 | 비고 |
|---|---|---|
| Node.js | 22 LTS | |
| pnpm | 9.x | 워크스페이스 |
| Docker | 26+ | 채점 컨테이너 |
| PostgreSQL | 16 | Docker Compose로 제공 |
| Redis | 7 | Docker Compose로 제공 |
| Python | 3.11 | **컨테이너 내부 전용** — 호스트 설치 불필요 |

배포 호스트는 최소 4코어. 워커 동시성 4를 전제한다.

## 2. 설치 절차

~~~
pnpm install
docker compose up -d postgres redis
pnpm db:migrate
docker build -t mlca-python:3.11 judge/image
node tools/problem-sync.js --all
~~~

## 3. 환경변수 (`.env` — 값은 비움, 커밋 금지 INV-1)

~~~
DATABASE_URL=
REDIS_URL=
SESSION_SECRET=
IP_HASH_SECRET=
JUDGE_IMAGE=mlca-python:3.11
JUDGE_WORK_DIR=
WORKER_CONCURRENCY=4
NODE_ENV=
~~~

`SESSION_SECRET`과 `IP_HASH_SECRET`은 서로 다른 값이어야 한다. 같은 값을 쓰면 세션 유출 시 IP 해시가 함께 역산 가능해진다.

## 4. 실행 명령

~~~
pnpm dev            web + api + worker 동시 기동
pnpm dev:web
pnpm dev:api
pnpm dev:worker
~~~

## 5. 검증 명령

~~~
pnpm build
pnpm typecheck
pnpm lint
pnpm test
node tools/contrast-check.js        INV-12
node tools/design-lint.js           금지 패턴
node tools/batch-judge.js --source reference    M6 게이트
~~~

## 6. 자원 요건

| 항목 | 값 |
|---|---|
| 채점 컨테이너 1개당 | CPU 1코어, 메모리 512MB |
| 동시 채점 | 4 |
| 채점 피크 메모리 | 약 2GB |
| API + 워커 + DB + Redis | 약 2GB |
| 권장 호스트 | 4코어 / 8GB |
