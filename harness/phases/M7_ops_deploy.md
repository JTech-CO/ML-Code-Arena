# M7 — 운영 / 배포 / CI

**상태**: 8/9 통과 · DoD 2(CI 그린) 확인 대기  **갱신**: 2026-08-07

## 맥락
단일 호스트 운영을 전제로 배포·모니터링·백업을 세운다. 1인 운영이므로 "문제가 생겼을 때 알아차릴 수 있는가"가 핵심이다.

## 진입조건 (DoR)
- [x] M6 DoD 통과
- [x] `docs/TECHNICAL.md` §12(비기능)·§13(운영) 확인
- [x] `docs/ENVIRONMENT.md` 배포 절차 확인 — 절차가 없었다. M7 이 §7 로 썼다
- [ ] **배포 호스트 확보 (최소 4코어) — 미충족**

### DoR 미충족 항목을 안고 시작한 이유

실제 리눅스 호스트가 없다. 사용자 결정으로 **로컬(16코어/68GB)에서 클린 상태를
재현해** 게이트를 돌리고, GitHub 저장소로 CI 를 실제 검증하는 쪽을 택했다.

이것이 무엇이 아닌지 분명히 해 둔다. "진짜 클린 호스트에서 돌았다"가 아니라
**"볼륨을 전부 지우고 문서 절차만으로 다시 세웠더니 돌았다"**이다. 검증되지 않은 채
남는 것은 §7.7 에 적었다 — 실제 서버 배포, TLS·도메인, systemd 유닛의 실제 기동.

## 할 일
Docker Compose 구성(api·worker·postgres·redis) -> 리버스 프록시(SSE 버퍼링 해제) -> CI(빌드·린트·타입체크·테스트·대비 검사·디자인 린트) -> 로깅 -> 모니터링 지표 -> DB 백업 크론 -> 부하 시험.

## 참조
`docs/TECHNICAL.md` §12·§13, `docs/ENVIRONMENT.md`, INV-1·INV-2.

## DoD (완료 게이트)
1. [x] 클린 호스트에서 `docs/ENVIRONMENT.md` 절차만으로 전체 스택이 기동된다.
2. [~] CI가 그린이며, 게이트에 대비 검사(INV-12)와 디자인 린트가 포함된다.
       — **CI 구성·수정 완료, 그린 확인은 미완.** GitHub 러너 큐 적체로 실행이
       `queued` 에 머문다. 아래 증거 참조.
3. [x] 부하 시험: 동시 제출 50건에서 유실 0건, 채점 완료 P95 < 5초, `IE` 비율 0.5% 미만.
4. [x] SSE가 프록시 뒤에서 5분 이상 끊기지 않는다.
5. [x] 모니터링 지표 4종이 수집된다 — 큐 대기 길이, 판정 분포, 워커 실패율, 익명→가입 전환율.
6. [x] `IE` 비율이 0.5%를 넘으면 알림이 발생한다.
7. [x] DB 일일 백업이 실행되고, 백업본으로 클린 DB 복구가 성공한다.
8. [x] 시크릿이 `.env`로만 주입되고 이미지·저장소에 포함되지 않는다(INV-1 준수).
9. [x] 워커 컨테이너가 최소 권한으로 실행되며, 워커 자체는 사용자 코드를 실행하지 않는다.

### 게이트 9번의 문구를 그대로 적용할 수 없었다

ADR-0007 로 **워커가 컨테이너가 아니게** 됐으므로 "워커 컨테이너"가 없다. 게이트를
낮추지 않고 두 조각으로 나눠 각각 확인했다.

- **최소 권한** — systemd 유닛의 강화 지시어로 받는다. 유일한 앱 컨테이너인 `api` 는
  런타임에서 직접 확인했다 (`ReadonlyRootfs=true`, `CapDrop=[ALL]`,
  `no-new-privileges`, uid 1000).
- **사용자 코드 미실행** — 이것이 배포 설계 전체를 떠받치는 명제라 검사로 고정했다
  (`apps/worker/src/architecture.test.js`).

## 검증
~~~
docker compose up -d && curl -sf localhost:3000/health
node tools/bench-submit.js --count 50 --concurrency 50
pg_dump ... && psql -f dump.sql   # 클린 DB 복구 확인
~~~

## 증거

### 게이트 1 — 클린 상태에서 문서 절차만으로 기동
볼륨을 전부 지우고(`down -v`) `docs/ENVIRONMENT.md` §7 만 보고 다시 세웠다.
**이 게이트가 실제 결함 셋을 잡았다** — 문서가 맞는지 읽어서는 알 수 없었다.

~~~
$ docker compose -f docker-compose.yml down -v     # 클린 상태 재현
 Volume mlca_postgres-data Removed / mlca_redis-data Removed

$ docker compose --env-file .env -f deploy/compose.yml up -d --build
 Container mlca-postgres-1 Healthy / mlca-redis-1 Healthy
 Container mlca-api-1 Healthy / mlca-caddy-1 Started

$ pnpm db:migrate     → 0001~0005 적용
$ pnpm problems:sync  → 문제 30건 · 개념 22건 · 링크 36건 (공개)

$ curl -sf http://localhost/health          {"status":"ok"}
$ curl -s http://localhost/api/problems     {"problems":[{"slug":"broadcast-shape",...
$ curl -o/dev/null -w '%{http_code}' /problems/l2-normalize      200  (SPA 폴백)
$ curl -sI /assets/index-*.js | grep -i cache-control
  Cache-Control: public, max-age=31536000, immutable
$ curl -sI / | grep -i cache-control
  Cache-Control: no-cache
$ 보안 헤더 3/3 (nosniff · DENY · same-origin)
~~~

**잡힌 결함 3건** (전부 문서·설정이 틀렸던 것이고, 읽어서는 안 보였다)

1. `docker compose -f deploy/compose.yml` 만으로는 Postgres 가 기동을 거부한다.
   compose 의 `${...}` 보간은 **compose 파일 옆** `.env` 를 읽는데 우리 `.env` 는
   저장소 루트다. `--env-file .env` 가 필요하다 (RUNBOOK 40).
2. `/health` 가 200 인데 본문이 API 의 JSON 이 아니라 SPA 의 `index.html` 이었다.
   프록시에 `/health` 경로가 없어 폴백이 잡았다 — **API 가 죽어도 헬스체크가 초록**이
   되는 상태였다 (RUNBOOK 41).
3. `index.html` 에 캐시 지시가 붙지 않았다. `header /index.html` 매처는 요청 경로가
   `/` 일 때 매치되지 않는다 (RUNBOOK 44).

### 게이트 3 — 부하 시험 (동시 50건)
~~~
$ node --env-file=.env tools/bench-submit.js --count 50 --concurrency 50
수렴        50/50  (30327ms)
판정 분포   {"AC":50}
채점 소요   P50 2251ms  P95 2721ms  max 2780ms   ← §12 게이트 (<5000ms)
종단 시간   P50 16697ms  P95 28504ms  max 30143ms   (큐 대기 포함)
IE 비율     0/50 = 0.00%  (임계 0.50%)
동시 컨테이너 최대 4  (표본 144회)
잔존 컨테이너 0
게이트 통과 — 유실 0 · 채점 P95 < 5s · IE < 0.5% · 잔존 컨테이너 0
~~~

**두 숫자를 다 찍은 이유.** §12 의 "채점 완료 P95 < 5초"는 처리량 계산
(2,800건/시 = 4 × 3600 / 5)에 그대로 쓰이는 값이므로 **제출 1건의 서비스 시간**이다.
일괄 50건에서 종단 시간(28.5초)은 앞선 제출을 기다린 시간을 포함하며, 그것은 성능이
아니라 큐 깊이의 함수다 — 동시성 4로 50건이면 마지막 건은 반드시 12배쯤 걸린다.
게이트를 종단 시간으로 읽으면 어떤 구현으로도 통과할 수 없고, 그렇다고 종단 시간을
감추면 사용자가 실제로 기다리는 시간이 보이지 않는다.

### 게이트 4 — SSE 6분 (프록시 뒤)
~~~
$ node tools/sse-soak.js --url http://localhost/api/stream/submissions --minutes 6
  content-type      text/event-stream
  content-encoding  (없음)          ← 압축이 걸리면 하트비트가 블록에 갇힌다
  x-accel-buffering no
지속       360s  (목표 360s)
하트비트   24회  (기대 약 24회)
최대 침묵  15.0s  (임계 45s)
재연결     0회
게이트 통과 — 끊김 없음 · 하트비트 정상 간격
~~~

### 게이트 5·6 — 지표 4종과 경보
~~~
$ node --env-file=.env tools/ops-metrics.js --window 1h
큐        대기 0  진행 0  지연 0  실패 0
          대기시간 P50 14557ms  P95 26314ms  (표본 50)
판정      AC 50 · IE 0/50 = 0.00%  (임계 0.50%)
워커      완료 50  재시도 0 (0.00%)  최대시도 1
익명      세션 0  풀이시작 0  가입전환 0 (0.00%)

$ # IE 를 인위적으로 만든 뒤 (--induce-ie ×4)
$ ALERT_WEBHOOK_URL=http://127.0.0.1:9999 node --env-file=.env tools/ops-metrics.js --check
ALERT IE 비율 7.41% > 임계 0.50% (4/54건, 구간 1h)
  — 최다 사유: 시도 3/3 소진: Error: 문제 디렉터리를 찾을 수 없다: ie-missing-cases (4건)
종료코드 1
[수신기] WEBHOOK 수신: ALERT IE 비율 7.41% ...
~~~

세 경로(stderr · 웹훅 · 종료 코드)가 모두 울렸고, **왜인지까지 말한다**. 사유는
`submissions.ie_reason` 에서 온다 — M7 이 추가한 컬럼이며 그 전에는 `IE` 가 이유 없이
저장돼 경보가 "IE 3%"까지만 말할 수 있었다.

### 게이트 7 — 백업과 복구
~~~
$ BACKUP_DIR=backup node --env-file=.env tools/db-backup.js --verify
덤프  mlca-2026-08-06T17-59-11.sql.gz  33.0KB
복구 검증  → mlca_restore_check
복구 성공  테이블 10개 · 행 224개 일치
    36 concept_problem_links / 22 concepts / 59 problem_tags
    32 problems / 54 submissions / 14 tags / 1 solved / 1 users
~~~

행 수까지 대조한다. 덤프가 열리는 것만 보면 스키마만 있고 데이터가 빠진 덤프도 통과한다.

### 게이트 8 — 시크릿
~~~
$ git ls-files --error-unmatch .env        → 추적 안 됨
$ 이미지 안 .env                            → 0건 (api·web 둘 다)
$ docker history | grep SECRET=|PASSWORD=  → 0건
$ 히스토리 전체에서 .env 가 존재한 적        → 0건 (.env.example 만, 값 비어 있음)
$ compose config 로 서비스별 시크릿 분포
  api       DATABASE_URL, IP_HASH_SECRET, POSTGRES_PASSWORD, SESSION_SECRET
  caddy     MLCA_SITE_ADDRESS            ← 프록시는 DB 비밀번호를 모른다
  postgres  POSTGRES_PASSWORD
  redis     (민감값 없음)
~~~

`.dockerignore` 가 없었다면 `.env` 가 빌드 컨텍스트에 들어갔다. 실제로 없었고 M7 이
추가했다 — 레이어에 박힌 시크릿은 이미지를 지워도 태그·캐시·레지스트리에 남는다.

### 게이트 9 — 최소 권한과 사용자 코드 미실행
~~~
$ docker inspect mlca-api-1
  ReadOnlyRootfs=true  CapDrop=[ALL]  SecurityOpt=[no-new-privileges:true]
$ docker exec mlca-api-1 id        uid=1000(node) gid=1000(node)
$ docker exec mlca-api-1 touch /nope
  touch: /nope: Read-only file system

$ systemd-analyze verify deploy/mlca-worker.service   (Linux 컨테이너 안)
  → 알 수 없는 지시어 0건. docker·node 부재 경고만 (러너 환경 탓)

$ node --test apps/worker/src/architecture.test.js
  ✔ 프로세스 생성은 sandbox/docker.js 한 곳에서만 한다
  ✔ 워커가 실행하는 바이너리는 docker 뿐이다
  ✔ 워커 소스에 동적 코드 실행 경로가 없다
  ✔ 제출 원문이 워커 프로세스에서 import 되지 않는다
~~~

**검사가 실제로 무는지 확인했다.** `result/db.js` 에 `spawn('python', ...)` 을 심자
첫 검사가 빨개졌고, 되돌리자 4/4 로 돌아왔다.

### 게이트 2 — CI
로컬에서 같은 게이트가 전부 그린인 상태로 푸시했다.

~~~
$ pnpm build && pnpm typecheck && pnpm lint && pnpm test    전부 통과
$ pnpm check:boundaries    경계 샘플 8건 중 8건 차단됨
$ pnpm check:contrast      전 조합 4.5:1 이상 통과
$ pnpm check:design        위반 0건
$ pnpm problems:report     점검 통과
$ pnpm judge:fixtures      게이트 25건 중 25건 통과
$ pnpm problems:verify     30문제 해시 일치
$ pnpm judge:batch --source reference   30/30 AC
$ pnpm judge:batch --source bypass      30/30 FBD
~~~

**CI 첫 실행이 리눅스에서만 나는 결함 셋을 잡았다** (run 31125473829). 이것이 CI 를
강화한 값어치다 — 개발이 Windows 라 셋 다 로컬에서는 초록이었다.

1. **케이스 생성이 리눅스에서 권한 거부로 죽는다.** `make_cases` 컨테이너가
   `--user=65534`(nobody) 로 도는데 마운트한 문제 디렉터리에 `cases/` 를 써야 한다.
   Docker Desktop 은 바인드 마운트 권한이 느슨해 보이지 않았다. **배포 절차 §7.3 의
   `pnpm problems:sync` 가 실제 호스트에서 그대로 막혔을 것이다.**
2. 경로 정규화 테스트가 Windows 전용 단언이었다.
3. CI 의 compose 검사가 `.env` 부재로 실패.

셋 다 고쳐서 밀었다 (`0ef548e`). CI 재실행은 **GitHub 러너 큐 적체로 확인하지 못했다** —
`queued` 상태로 10분 이상 머물고, 지연 도착한 push 이벤트가 concurrency 그룹으로 서로를
취소시켰다. 남은 확인 절차는 §미결에 적었다.

## 롤백 계획
이미지 태그를 커밋 SHA(`MLCA_TAG`)로 고정하고 이전 SHA 로 되돌린다 —
`docs/ENVIRONMENT.md` §7.6. DB 마이그레이션은 모든 항목에 `down.sql` 이 함께 있다
(ADR-0008).

## 리스크 / 미지수
- Docker 소켓 마운트는 호스트 루트 권한과 동등하다. 워커를 전용 호스트에 격리하거나 rootless로 전환하는 결정이 필요하다(ADR-0007 후보).
- 단일 호스트이므로 워커 장애가 곧 서비스 중단이다. Phase 1 규모에서는 수용하되 복구 절차를 런북에 둔다.

### 처리한 것 / 남은 것

**ADR-0007 채택.** 워커를 호스트 프로세스로 둔다. 소켓을 컨테이너 안에 넣지 않는 쪽이며,
가장 강한 근거는 보안 등급이 아니라 **검증한 형태와 배포하는 형태를 같게** 두는 것이다.
남은 위험(`docker` 그룹 = 루트 등가)은 없애지 못했고 두 겹으로 받쳤다 — systemd 강화와
"워커는 사용자 코드를 실행하지 않는다"를 고정하는 검사. rootless 이행의 판정 기준은
ADR 에 적었다: 리눅스 호스트에서 `judge:fixtures` 25건이 그대로 통과하는지 하나다.

**단일 호스트 위험은 그대로 수용한다.** 복구는 재기동이며 RUNBOOK 20·21 이 다룬다.

## 미결 — 다음 세션이 확인할 것

1. **CI 그린 확인 (DoD 2).** `0ef548e` 로 세 결함을 고쳐 밀었고 로컬에서는 같은 게이트가
   전부 통과한다. GitHub 러너 큐가 풀리면 재실행 결과만 보면 된다.
   - 특히 **`make_cases` uid 수정은 리눅스에서만 실효를 확인할 수 있다.** Windows 는
     `65534` 분기를 타므로 개발 기계에서 검증한 것은 로직뿐이다.
2. **GitHub Pages 가 켜져 있다.** 푸시마다 빌드가 돌고 실패한다. 이 프로젝트는 서버가
   필요해 Pages 로 서빙할 수 없다. 저장소 설정이므로 사용자가 끄면 된다.
3. **`cancel-in-progress` 재고.** 지연 도착한 push 이벤트가 서로를 취소시켰다. 큐가
   정상일 때는 문제가 아니지만, 이번처럼 밀릴 때 마지막 하나만 남는다.
4. **호스트 확보 후**: 실제 배포, TLS·도메인, systemd 유닛 실기동, rootless 판정.

## 주의
"배포됐다"가 완료가 아니다. **문제가 생겼을 때 알아차릴 수 있는가**가 완료 기준이다. 게이트 5·6번이 그 판정이다.
