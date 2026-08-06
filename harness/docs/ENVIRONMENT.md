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

---

## 7. 배포 (M7)

단일 리눅스 호스트 하나에 전부 올린다. **이 절만 보고 배포할 수 있어야 한다** — M7 DoD 1
이 그것을 게이트로 둔다. 구조와 근거는 `deploy/README.md`.

~~~
호스트
├── systemd  mlca-worker.service       채점 워커 (Node) — compose 밖 (ADR-0007)
│      └── docker run mlca-python:3.11  제출 1건당 1개, 즉시 파기 (INV-8)
└── docker compose --env-file .env -f deploy/compose.yml
       ├── caddy      :80/:443   정적 web + /api 프록시
       ├── api        :3000      내부 네트워크만
       ├── postgres   16         127.0.0.1:5432 (워커가 호스트에서 붙는다)
       └── redis      7          127.0.0.1:6379
~~~

### 7.1 사전 준비 (호스트 1회)

~~~bash
# Docker Engine + compose 플러그인, Node 22, pnpm, git 을 설치한다.
sudo useradd --system --home /opt/mlca --shell /usr/sbin/nologin mlca
sudo usermod -aG docker mlca            # 소켓 접근. 사실상 루트 등가임을 알고 준다
sudo mkdir -p /var/lib/mlca/judge-work /var/lib/mlca/backup
sudo chown -R mlca:mlca /var/lib/mlca

sudo git clone https://github.com/JTech-CO/ML-Code-Arena /opt/mlca
sudo chown -R mlca:mlca /opt/mlca
~~~

### 7.2 설정

~~~bash
cd /opt/mlca
cp deploy/env.production.example .env
chmod 600 .env

# 시크릿 두 개는 서로 달라야 한다. 같으면 API 가 기동을 거부한다.
openssl rand -base64 48    # SESSION_SECRET
openssl rand -base64 48    # IP_HASH_SECRET
openssl rand -base64 32    # POSTGRES_PASSWORD

# .env 를 채운다. DATABASE_URL 은 호스트 기준으로 적는다 —
# 컨테이너의 api 용 주소는 compose 가 postgres:5432 로 덮어쓴다.
#   DATABASE_URL=postgres://<user>:<pw>@127.0.0.1:5432/<db>
#   MLCA_TAG=$(git rev-parse --short HEAD)
~~~

`.env` 는 커밋하지 않는다 (INV-1). `.gitignore` 가 막고 CI 가 확인한다.

### 7.3 기동

~~~bash
cd /opt/mlca
pnpm install --frozen-lockfile
pnpm judge:image                                   # mlca-python:3.11

docker compose --env-file .env -f deploy/compose.yml up -d --build
pnpm db:migrate                                    # 스택이 뜬 뒤에 돈다
pnpm problems:sync                                 # 문제 30개 + 개념 22건 적재

sudo cp deploy/mlca-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mlca-worker
~~~

### 7.4 확인

~~~bash
curl -sf http://localhost/health                   # {"status":"ok"}
curl -s http://localhost/api/problems?limit=1 | head -c 200
systemctl is-active mlca-worker                    # active
node --env-file=.env tools/ops-metrics.js          # 지표 4종
~~~

### 7.5 정기 작업 (cron)

~~~cron
# 일 1회 백업 + 복구 검증. 덤프를 만드는 것은 백업이 아니고, 복구되는 덤프만 백업이다.
15 4 * * *  cd /opt/mlca && BACKUP_DIR=/var/lib/mlca/backup node --env-file=.env tools/db-backup.js --verify >> /var/log/mlca-backup.log 2>&1

# 10분마다 IE 비율 확인. 임계 초과 시 종료 코드 1 + 로그 + (설정 시) 웹훅.
*/10 * * * * cd /opt/mlca && node --env-file=.env tools/ops-metrics.js --check --window 1h >> /var/log/mlca-alert.log 2>&1
~~~

### 7.6 배포 갱신과 롤백

~~~bash
cd /opt/mlca && git fetch && git checkout <새 SHA>
sed -i "s/^MLCA_TAG=.*/MLCA_TAG=$(git rev-parse --short HEAD)/" .env
pnpm install --frozen-lockfile
docker compose --env-file .env -f deploy/compose.yml up -d --build
pnpm db:migrate && pnpm problems:sync
sudo systemctl restart mlca-worker
~~~

롤백은 같은 절차를 이전 SHA 로 반복한다. 스키마를 되돌려야 하면 `pnpm db:migrate` 대신
`node --env-file=.env tools/migrate.js down` 을 필요한 횟수만큼 돌린다 — 모든
마이그레이션에 `down` 이 함께 있다 (ADR-0008).

### 7.7 이 절차가 다루지 않는 것

- **TLS·도메인**: `MLCA_SITE_ADDRESS` 에 도메인을 넣으면 Caddy 가 인증서를 자동
  발급한다. 실제 도메인으로 확인한 적은 없다 — 확보 후 검증이 필요하다.
- **워커 다중화**: 큐 구조상 워커를 늘리는 데 코드 변경이 없지만 (ADR-0001),
  Phase 1 은 단일 노드 전제다. 워커 장애가 곧 채점 중단이며 복구는 재기동이다.
