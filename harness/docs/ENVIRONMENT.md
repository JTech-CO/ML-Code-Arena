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
cp .env.example .env         # 값을 채운다. 커밋 금지 (INV-1)
pnpm db:up                   # docker compose up -d (Postgres 16 · Redis 7)
pnpm db:migrate              # 평문 SQL 마이그레이션 (ADR-0008)
pnpm judge:image             # docker build -t mlca-python:3.11 judge/image
node tools/judge-cli.js --prepare --problem <slug>   # 케이스 생성 (INV-10)
~~~

`docker-compose.yml` 의 계정·비밀번호는 개발 전용이다. 배포 값은 M7 에서 정한다.

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
pnpm check:boundaries               INV-3 — 경계 룰이 실제로 막는지
pnpm judge:image                    채점 이미지 빌드
pnpm judge:fixtures                 M1 게이트 — 판정 8종 + 격리 불변식
node tools/contrast-check.js        INV-12
node tools/design-lint.js           금지 패턴
node tools/batch-judge.js --source reference    M6 게이트
~~~

`pnpm judge:fixtures` 는 Docker 데몬이 떠 있어야 한다. 격리 없이 채점하지 않는다(INV-4).

러너 단위 테스트는 `judge:fixtures` 안에서 **컨테이너 안**에 돌린다. 채점이 실제로 도는
numpy 버전과 같은 곳에서 확인해야 하기 때문이다. 빠른 반복이 필요하면 호스트에서도
돌릴 수 있으나(`python -m unittest discover -s judge/tests`), 그 결과는 정본이 아니다.

## 6. 자원 요건

| 항목 | 값 |
|---|---|
| 채점 컨테이너 1개당 | CPU 1코어, 메모리 512MB |
| 동시 채점 | 4 |
| 채점 피크 메모리 | 약 2GB |
| API + 워커 + DB + Redis | 약 2GB |
| 권장 호스트 | 4코어 / 8GB |
