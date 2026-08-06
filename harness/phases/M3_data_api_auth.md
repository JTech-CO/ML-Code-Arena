# M3 — 데이터 모델 + API + 인증/익명 세션

**상태**: 완료 · DoD 10/10 통과  **갱신**: 2026-08-06

## 맥락
채점 파이프라인 위에 HTTP 계층을 얹는다. 익명 세션과 계정 승계가 이 프로젝트의 전환 설계 핵심이므로 여기서 정확히 만든다.

## 진입조건 (DoR)
- [x] M2 DoD 통과
- [x] `docs/TECHNICAL.md` §6(데이터 모델)·§7(API)·§8(인증) 정독
- [x] Postgres 기동 및 마이그레이션 도구 결정 — M2 에서 ADR-0008 로 앞당겨 결정했다.
      스키마 절반(0001·0002)도 이미 적용돼 있었다.
- [x] INV-5·INV-9 확인, ADR-0004·ADR-0005 확인

## 할 일
스키마 마이그레이션 -> 인덱스 -> Fastify 라우트 골격 -> 인증(argon2id + 서버 세션 쿠키) -> 익명 세션 발급·카운트 -> 제출 접수 라우트 -> 제출 조회 -> SSE 스트림 -> 제출 빈도 제한 -> 계정 승계 트랜잭션.

## 참조
`docs/TECHNICAL.md` §6·§7·§8, `decisions/0004-server-session-not-jwt.md`, `decisions/0005-anon-limit-as-friction.md`, INV-5·INV-9.

## DoD (완료 게이트)
1. 마이그레이션이 클린 DB에서 성공하고, 롤백(down)도 성공한다.
2. `POST /api/submissions` 가 202와 `submission_id`·`queue_position`을 반환하고, 채점 완료 후 `GET /api/submissions/:id` 가 판정을 반환한다.
3. **API 응답 어디에도 기대값이 없다**(INV-5 준수) — `WA` 응답 전문에서 기대값 grep 0건, 응답 스키마 테스트 통과.
4. 익명 사용자가 **고유 문제 10개**까지 제출 가능하고 11번째 고유 문제에서 `403 ANON_LIMIT_REACHED`. 같은 문제 반복 제출은 카운트를 증가시키지 않는다.
5. 조작된 요청(쿠키 위조·헤더 조작·클라이언트 카운트 전송)으로 제한을 우회할 수 없다(INV-9 준수).
6. 로그인 시 익명 제출 이력이 계정으로 승계되고 `solved` 가 정확히 채워진다. 승계는 단일 트랜잭션이며 중간 실패 시 원자적으로 롤백된다.
7. 익명 제출이 SSE 스트림에 노출되지 않는다.
8. 제출 빈도 제한이 큐 앞단에서 차단한다 — 로그인 사용자 문제당 10초 1회, 익명 30초 1회.
9. 비밀번호가 argon2id로 해시되고 평문·약한 해시가 DB에 없다.
10. IP는 원본이 아닌 HMAC 해시로만 저장된다.

## 검증
~~~bash
pnpm db:up && pnpm db:migrate
pnpm --filter @mlca/api run test      # DoD 3~10 (inject + 진짜 DB·Redis)
node tools/migrate.js down x3 && up   # DoD 1

pnpm dev:api && pnpm dev:worker       # 별도 터미널
pnpm e2e:api                          # DoD 2 — API→큐→워커→DB→API 왕복
~~~

## 증거

### 단위·통합 (`app.inject()` + 진짜 Postgres·Redis)
~~~
apps/api test:  tests 27  pass 27  fail 0
전체:           shared 14 + worker 30 + api 27 = 71건 통과
~~~

저장소를 흉내 내지 않았다. 익명 한도·빈도 제한·승계는 전부 저장소 동작에 얹혀 있어,
가짜 저장소로 검증하면 검증한 것이 우리 흉내이지 시스템이 아니다. 큐만 가짜다 —
큐 왕복은 아래 종단 게이트가 본다.

### DoD 1 — 마이그레이션 왕복
~~~
down x3 → 남은 테이블 1(_migrations) · 뷰 0 · 트리거 0
up  x4 → 테이블 10 · 뷰 2 · 트리거 1
~~~

### DoD 2 — 종단 왕복 (`pnpm e2e:api`)
~~~
[PASS] POST /api/submissions 가 202 와 submission_id · queue_position 을 준다
       status=202 {"submission_id":"86178f22…","status":"PENDING","queue_position":1}
[PASS] 워커가 채점한 결과를 GET /api/submissions/:id 가 돌려준다   verdict=AC memory=32MB
[PASS] shape 불일치가 WA 로 오고 기대 shape 가 함께 온다
       detail={"reason":"shape_mismatch","expected_shape":[3,3],"actual_shape":[9]}
[PASS] WA 응답에 제출 원문이 실리지 않는다
[PASS] 로그인 사용자의 채점 결과가 SSE 로 흘러온다   수신 2건
[PASS] SSE 이벤트에 기대값·원문이 없다
종단 게이트 6건 중 6건 통과.
~~~

### DoD 3 — 기대값 비노출 (INV-5)
`src/serialize.js` 가 **통과 목록**으로 필드를 고정한다. 차단 목록이었다면 러너나
스키마에 새 필드가 생길 때 기본으로 노출되고, 그 사실은 아무도 모른다.

테스트는 워커가 실수로 기대값을 실었다고 가정하고 넣는다 —
`expected_value` · `expect: 'SECRET-EXPECTED-VALUE'` · `answer: 42.123456789`.
응답 전문에서 전부 0건이고, `expected_shape`·`reason` 만 남는다.

### DoD 4·5 — 익명 한도와 우회 차단 (INV-9)
- 고유 문제 10개까지 202, 11번째 403 `ANON_LIMIT_REACHED`
- 같은 문제 5회 제출 후 `solved_count=1` — 제출 횟수가 아니라 고유 문제 수다
- 본문 `solved_count:0` · 헤더 `x-anon-solved-count:0` · 본문 `anon_session_id` 위조 → 여전히 403
- **`anon_sessions.solved_count` 컬럼을 0 으로 직접 UPDATE 해도 403** — 카운터는
  표시용 캐시일 뿐이고 판단은 제출 이력에서 센다
- 서명 없는 익명 쿠키로 남의 세션 ID 를 가리켜도 새 세션이 발급되고, 피해자 세션의
  제출 수는 그대로다

### DoD 6 — 계정 승계
익명으로 2건(AC 1 · WA 1) 제출 후 가입 → `movedSubmissions=2`, 익명 소유 0건,
`solved` 1행(AC 만), 랭킹에 `solved_count=1`. 단일 트랜잭션이며 두 번 실행해도
`movedSubmissions=0` 으로 결과가 같다.

### DoD 7 — 익명 제출은 스트림에 없음
익명 제출을 채점 완료로 만들고 알림을 태워도 구독자 수신 0건. 로그인 사용자는 1건
수신하고, 이벤트 키는 `id·handle·problem·verdict·runtime_ms` 다섯뿐이다.

### DoD 8 — 빈도 제한
같은 문제 연속 제출 → 429 `RATE_LIMITED` + `Retry-After`.
거부된 요청은 **큐에도 DB 에도 들어가지 않는다** — 채점 자원이 유한하므로 큐 앞단에서 끊는다.

### DoD 9 — 비밀번호
~~~
argon2id / 전체 사용자 : 3 / 3
CHECK 제약 users_password_hash_argon2id : 존재
평문 삽입 시도 → ERROR: violates check constraint
~~~
같은 비밀번호도 매번 다른 해시가 되고(솔트), 응답 어디에도 해시가 실리지 않는다.
없는 계정과 틀린 비밀번호가 **같은 응답**을 준다 — 계정 존재 여부가 드러나지 않는다.

### DoD 10 — IP
`ip_hash` 는 32바이트이고 `IP_HASH_SECRET` 으로 만든 HMAC-SHA256 과 정확히 일치한다.
원본 IP 문자열은 없고, 원본을 담을 컬럼 자체가 스키마에 없다.
`SESSION_SECRET` 과 다른 키를 쓰는지도 확인한다 — 같으면 세션 유출이 곧 IP 역산이 된다.

### 회귀
M1 게이트 25/25, M2 벤치 8/8 AC·동시 컨테이너 4·잔존 0, M0 게이트 5종 전부 그린.

## 롤백 계획
마이그레이션은 down을 항상 함께 작성한다. API는 라우트 단위 커밋으로 분리해 문제 라우트만 revert 가능하게 둔다.

## 이 phase 에서 잡은 것

**벤치 도구가 `users` 에 자리표시자 해시를 넣고 있었다.** 로그인 경로가 아니라서
동작에는 문제가 없었지만, "DB 에 약한 해시가 없다"는 명제(DoD 9)는 그것만으로 깨진다.
애플리케이션 코드만 지키면 되는 규약은 언젠가 다른 경로가 뚫는다. `users_password_hash_argon2id`
CHECK 제약을 걸어 **어떤 경로로 들어와도 깨질 수 없게** 했고, 평문 삽입이 실제로
거부되는지 확인했다.

**테스트 파일이 병렬로 돌아 서로의 DB 를 지우고 있었다.** 9건이 실패했는데 원인은
코드가 아니라 격리였다. `--test-concurrency=1` 로 직렬화했다. 또한 node 의 기본 탐색
패턴이 `test/` 디렉터리의 **모든** `.js` 를 테스트로 잡아 헬퍼까지 실행하고 있었다 —
실행 대상을 `test/*.test.js` 로 명시했다.

## 리스크 / 미지수
- 익명 제한은 쿠키 삭제·시크릿 창으로 우회 가능하다. 이는 **설계상 수용**이며(ADR-0005) 완전 차단을 시도하다 정상 사용자를 오탐으로 막지 않는다.
- SSE가 리버스 프록시 뒤에서 끊길 수 있다. 런북 27번 참조. 하트비트와
  `X-Accel-Buffering: no` 를 넣었으나 실제 프록시 뒤 검증은 M7 몫이다.
- **`X-Forwarded-For` 를 신뢰하지 않는다.** 지금은 `request.ip` 를 그대로 쓰므로 리버스
  프록시 뒤에 두면 모든 익명 사용자가 프록시 IP 하나로 묶인다. 익명 식별은 쿠키가 주이고
  IP 는 보조 지표라 Phase 1 에서는 감당 가능하지만, M7 에서 `trustProxy` 신뢰 범위를
  명시해야 한다. 헤더를 그냥 믿으면 헤더 하나로 익명 식별을 흔들 수 있다 (INV-9).
- 세션은 Redis 에 있고 TTL 2주다. Redis 를 비우면 전원 로그아웃된다. 단일 인스턴스
  전제에서는 수용하지만 M7 에서 재기동 절차에 적어야 한다.
- `queuePosition()` 정의가 `apps/api` 와 `apps/worker` 에 두 벌 있다. 경계 규칙상
  공유할 수 없다(INV-3). 한쪽을 고치면 다른 쪽도 고쳐야 한다.

## 주의
- 익명 카운트는 **고유 문제 수**다. 제출 횟수가 아니다. 재시도 한 번에 한도가 소진되면 안 된다.
- 승계 쿼리는 로그인 트랜잭션 **안에서** 실행한다. 쿠키를 먼저 지우면 이력이 유실된다(런북 29번).
