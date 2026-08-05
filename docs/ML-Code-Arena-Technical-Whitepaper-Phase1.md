# ML Code Arena — 기술 백서 (Phase 1)

| 항목 | 내용 |
|---|---|
| 문서 버전 | 0.1.0 |
| 작성일 | 2026-08-05 |
| 대상 범위 | MVP Phase 1 |
| 후속 문서 | 디자인 백서 → 하네스 팩 → 구현 |

---

## 1. 문서 개요

### 1.1 목적

ML Code Arena Phase 1의 구현 가능한 기술 명세를 확정한다. 이 문서는 디자인 백서와 하네스 팩의 상위 계약이며, 여기에 정의되지 않은 기능은 Phase 1 구현 대상이 아니다.

### 1.2 시스템 정의

AI/머신러닝/딥러닝 주제에 특화된 온라인 저지 플랫폼. 일반 알고리즘 저지와의 근본 차이는 **정답이 단일 문자열이 아니라는 점**이며, 이 차이가 채점 엔진 설계 전체를 규정한다.

### 1.3 용어

| 용어 | 정의 |
|---|---|
| 제출(Submission) | 사용자가 특정 문제에 대해 보낸 소스 코드 1건 |
| 채점(Judge) | 제출을 격리 환경에서 실행하고 판정을 산출하는 행위 |
| 하네스(Harness) | 사용자 코드를 import 하여 호출하고 결과를 비교하는 플랫폼 제공 러너 |
| 엔트리포인트 | 사용자가 반드시 구현해야 하는 함수 이름 |
| 판정(Verdict) | 채점 결과 상태 코드 |
| 익명 세션 | 로그인하지 않은 사용자에게 부여되는 서버 측 식별자 |

---

## 2. 범위 정의

### 2.1 Phase 1 포함 범위

- 지원 언어: **Python 3.11 단독**
- 채점 모드: **`tolerance`**, **`structural`** 2종
- 실행 환경: **CPU 전용**, 단일 채점 노드
- 문제 수: **초기 30문제**
- 트랙: 문제집 / 유형 설명 / 랭킹 3종
- 인증: 이메일 + 비밀번호 자체 인증
- 비로그인 사용자: 고유 문제 기준 10문제까지 풀이 가능, 랭킹 제외

### 2.2 Phase 1 제외 범위

다음은 명시적으로 구현하지 않는다. Phase 1의 목표는 기능 완결성이 아니라 **채점 파이프라인의 검증**이다.

- Go, R 언어 지원
- `metric_threshold`, `leaderboard`, `exact` 채점 모드
- 모델 학습을 요구하는 문제 (실행 시간 30초 초과 문제 일체)
- 외부 데이터셋 파일 마운트
- GPU 노드
- 아레나(정기 콘테스트)
- Elo/티어 기반 레이팅
- 표절 검사
- 소셜 로그인, 이메일 인증 메일 발송

### 2.3 제외 근거

학습 문제를 배제하면 실행 시간 상한을 10초로 고정할 수 있고, 이에 따라 데이터셋 스토리지·워커 오토스케일링·장시간 큐 관리가 전부 불필요해진다. Phase 1 인프라 복잡도의 대부분이 여기서 제거된다.

---

## 3. 아키텍처

### 3.1 컴포넌트 구성

```
[웹 클라이언트]
      │ HTTPS / SSE
      ▼
[API 서버 (Fastify)] ──── [PostgreSQL]
      │
      │ enqueue
      ▼
[채점 큐 (Redis + BullMQ)]
      │ consume
      ▼
[채점 워커 (Node)] ──spawn──> [격리 컨테이너 (Docker)]
      │
      └── 결과 기록 → PostgreSQL → SSE 브로드캐스트
```

### 3.2 기술 스택

| 계층 | 선택 | 근거 |
|---|---|---|
| 프론트엔드 | React 18 + Vite + Zustand | 기존 컨벤션 |
| 언어 | JavaScript ESM + JSDoc 타입 주석 | 기존 컨벤션 |
| API 서버 | Fastify | 기존 컨벤션, SSE 네이티브 지원 |
| DB | PostgreSQL 16 | 관계 모델 + JSONB 혼용 필요 |
| 큐 | Redis 7 + BullMQ | Node 네이티브, 재시도·지연·동시성 제어 내장 |
| 채점 격리 | Docker (rootless 권장) | 표준 격리 원시 기능 사용 |
| 채점 런타임 | `python:3.11-slim` + numpy, scipy | 최소 이미지 |

BullMQ를 Redis Stream 직접 구현 대신 선택하는 이유는 재시도·타임아웃·중복 방지가 이미 구현되어 있고, Phase 1 규모에서 직접 구현할 이유가 없기 때문이다.

### 3.3 배포 토폴로지

Phase 1은 **단일 호스트**로 운영한다.

- `api` 컨테이너 1개
- `worker` 컨테이너 1개 (내부 동시성 4)
- `postgres` 1개
- `redis` 1개
- 채점 대상 컨테이너는 워커가 호스트 Docker 소켓을 통해 임시 생성 후 즉시 파기

**보안 주의**: 워커에 Docker 소켓을 마운트하는 것은 사실상 호스트 루트 권한과 동등하다. 워커 프로세스 자체가 사용자 코드를 실행하지 않으며 오직 컨테이너 생성만 담당한다는 전제를 반드시 유지해야 한다. 장기적으로는 rootless Podman 또는 gVisor로의 전환이 바람직하다.

---

## 4. 채점 엔진 명세

Phase 1의 핵심이자 나머지 설계를 규정하는 부분이다.

### 4.1 채점 모드

#### 4.1.1 `tolerance`

수치 결과를 허용 오차 내에서 비교한다.

**비교 규칙**

| 반환 타입 | 판정 기준 |
|---|---|
| 스칼라 (int, float) | `abs(a - b) <= atol + rtol * abs(b)` |
| `numpy.ndarray` | shape 완전 일치 → `np.allclose(a, b, rtol, atol, equal_nan)` |
| list / tuple | 길이 일치 → 재귀 비교 |
| dict | 키 집합 일치 → 값 재귀 비교 |
| str, bool | 완전 일치 |

**기본값**: `rtol = 1e-5`, `atol = 1e-8`, `equal_nan = false`. 문제별 오버라이드 가능.

**shape 검사**: ndarray 반환 문제는 shape 불일치를 `WA`로 판정하되, 오답 메시지에 기대 shape와 실제 shape를 함께 표시한다. ML 입문자의 가장 흔한 오류가 축(axis) 실수이므로 이 피드백은 교육적 가치가 크다.

**dtype 검사**: 기본적으로 검사하지 않는다. 단 문제가 `require_dtype`을 명시한 경우에만 검사한다 (예: 정수 인덱스 배열 반환 문제).

#### 4.1.2 `structural`

라이브러리 사용 여부를 정적으로 검사한다. "경사하강법을 직접 구현하라"는 문제에 `sklearn.LinearRegression`을 쓰면 통과해버리는 문제를 막는 장치이며, ML 저지의 교육적 가치를 유지하는 핵심 기능이다.

`structural`은 단독 모드가 아니라 **`tolerance`와 항상 함께 적용된다**. 즉 정적 검사를 통과한 뒤 수치 비교를 수행한다.

**검사 항목**

```jsonc
{
  "forbidden_imports": ["sklearn", "torch", "tensorflow", "statsmodels"],
  "forbidden_attributes": ["numpy.linalg.svd", "numpy.linalg.lstsq"],
  "forbidden_builtins": ["eval", "exec", "compile", "__import__", "open", "input"],
  "allowed_imports": ["numpy", "math", "typing", "dataclasses"],
  "required_entrypoint": "solve"
}
```

**구현 방식**: Python 표준 `ast` 모듈로 소스를 파싱하고 `ast.NodeVisitor`로 순회한다. `forbidden_*`는 블랙리스트, `allowed_imports`는 화이트리스트이며 **두 규칙이 충돌할 경우 화이트리스트가 우선**한다. 즉 `allowed_imports`에 없는 모든 import는 거부된다.

**우회 차단**: 다음 패턴은 무조건 거부한다.

- `__import__(...)` 호출
- `importlib` 계열 import
- `getattr` / `setattr`의 인자가 문자열 리터럴이 아닌 경우
- 문자열을 코드로 실행하는 모든 경로 (`eval`, `exec`, `compile`)
- `globals()`, `locals()`, `vars()` 호출

**한계 명시**: AST 검사는 완벽하지 않다. Phase 1은 "의도적 우회 시도"가 아니라 "무심코 라이브러리를 쓰는 경우"를 잡는 것을 목표로 한다. 정교한 우회는 향후 실행 시점 import hook으로 보완한다.

### 4.2 채점 프로토콜

#### 4.2.1 컨테이너 내부 파일 배치

```
/judge/
  runner.py          플랫폼 제공 하네스 러너 (읽기 전용)
  solution.py        사용자 제출 코드 (읽기 전용)
  spec.json          채점 명세 (제한 규칙 + 허용 오차)
  cases/
    case_00.pkl      입력 인자
    expect_00.pkl    기대 반환값
    ...
```

테스트케이스는 pickle 대신 **numpy `.npz` 또는 JSON**을 사용한다. pickle은 역직렬화 시 임의 코드 실행이 가능하므로 신뢰 경계를 넘는 데이터 포맷으로 부적합하다.

#### 4.2.2 러너 실행 순서

1. `spec.json` 로드
2. `solution.py`를 **텍스트로 읽어 AST 정적 검사** 수행 → 위반 시 즉시 `FBD` 반환 후 종료 (사용자 코드는 실행되지 않음)
3. `solution` 모듈 import
4. `required_entrypoint` 함수 존재 여부 확인 → 없으면 `RE`
5. 각 테스트케이스에 대해 순차 실행
   - 입력 로드 → 엔트리포인트 호출 → 반환값 수집
   - 케이스별 개별 시간 측정
6. 반환값과 기대값을 `tolerance` 규칙으로 비교
7. 결과 JSON을 stdout에 단일 라인으로 출력

**AST 검사가 import보다 먼저 수행되는 순서가 중요하다.** 모듈 최상위에 부작용 코드가 있을 경우 import 시점에 실행되기 때문이다.

#### 4.2.3 러너 출력 스키마

```jsonc
{
  "verdict": "AC",
  "cases": [
    { "index": 0, "verdict": "AC", "runtime_ms": 12 },
    { "index": 1, "verdict": "WA", "runtime_ms": 9,
      "detail": { "expected_shape": [3, 3], "actual_shape": [3] } }
  ],
  "total_runtime_ms": 21,
  "peak_memory_mb": 48,
  "error": null
}
```

사용자에게는 **첫 실패 케이스의 인덱스와 shape 정보까지만** 노출한다. 기대값 자체는 절대 노출하지 않는다.

### 4.3 판정 코드

| 코드 | 의미 | 발생 조건 |
|---|---|---|
| `AC` | 정답 | 전 케이스 통과 |
| `WA` | 오답 | 허용 오차 밖 또는 shape 불일치 |
| `TLE` | 시간 초과 | 벽시계 제한 초과 |
| `MLE` | 메모리 초과 | cgroup OOM 발생 |
| `RE` | 런타임 오류 | 예외 발생, 엔트리포인트 부재 |
| `CE` | 구문 오류 | AST 파싱 실패 |
| `FBD` | 금지 사용 | 정적 검사 위반 |
| `IE` | 내부 오류 | 채점 인프라 장애 (사용자 책임 아님) |

`FBD`는 ML 저지 고유 판정이다. 사용자에게는 "이 문제는 `sklearn` 사용이 금지되어 있습니다" 형태로 **어떤 규칙을 위반했는지 명시**한다. 침묵하는 오답은 학습을 방해한다.

`IE`는 제출 이력에 기록하되 **랭킹 집계와 제출 횟수에서 제외**하고 자동 재시도 대상으로 삼는다.

### 4.4 부분 점수

Phase 1은 부분 점수를 두지 않는다. 전 케이스 통과 시에만 `AC`이며, 문제별 점수는 0 또는 100이다. 부분 점수는 `metric_threshold` 모드 도입 시 함께 설계한다.

---

## 5. 실행 격리 및 보안

### 5.1 컨테이너 실행 옵션

```
docker run --rm
  --network=none
  --read-only
  --tmpfs /tmp:rw,noexec,nosuid,size=64m
  --memory=512m --memory-swap=512m
  --cpus=1.0
  --pids-limit=64
  --user=65534:65534
  --cap-drop=ALL
  --security-opt=no-new-privileges
  --security-opt=seccomp=default
  -v /judge/<submission_id>:/judge:ro
  mlca-python:3.11
  timeout -s KILL 10 python /judge/runner.py
```

### 5.2 제한값

| 항목 | Phase 1 값 | 근거 |
|---|---|---|
| 벽시계 시간 | 10초 | 학습 문제 배제 전제 |
| CPU 시간 | 8초 | 벽시계보다 짧게 두어 sleep 회피 차단 |
| 메모리 | 512MB | numpy 중형 배열 연산 여유 |
| 프로세스 수 | 64 | fork bomb 방어 |
| `/tmp` 크기 | 64MB | 디스크 고갈 방어 |
| 출력 크기 | 1MB | 로그 폭탄 방어, 초과 시 절단 후 `RE` |

### 5.3 네트워크 차단

`--network=none`으로 완전 차단한다. Phase 1에는 외부 데이터셋이 없으므로 예외가 필요 없다. 이 정책은 향후에도 유지하며, 데이터셋은 항상 볼륨 마운트로만 전달한다.

### 5.4 소스 코드 보존

제출 코드는 원문 그대로 DB에 저장한다. 채점 실패 재현과 향후 표절 검사에 필요하다. 저장 시 크기 상한은 64KB.

### 5.5 컨테이너 재사용 금지

제출 1건당 컨테이너 1개를 생성하고 즉시 파기한다. 재사용은 상태 오염 위험이 있으며, Phase 1 규모에서 콜드 스타트 비용(약 200~400ms)은 허용 범위다. 이미지는 워커 기동 시 사전 pull 하여 첫 제출 지연을 방지한다.

---

## 6. 데이터 모델

### 6.1 스키마

```sql
-- 사용자
users (
  id            uuid PK,
  email         citext UNIQUE NOT NULL,
  password_hash text NOT NULL,          -- argon2id
  handle        varchar(20) UNIQUE NOT NULL,
  created_at    timestamptz NOT NULL,
  last_seen_at  timestamptz
)

-- 익명 세션
anon_sessions (
  id             uuid PK,
  ip_hash        bytea NOT NULL,        -- HMAC-SHA256, 원본 IP 미저장
  ua_hash        bytea NOT NULL,
  solved_count   int NOT NULL DEFAULT 0,-- 고유 문제 기준
  merged_user_id uuid FK -> users NULL, -- 계정 승계 시 기록
  created_at     timestamptz NOT NULL
)

-- 문제
problems (
  id                uuid PK,
  slug              varchar(64) UNIQUE NOT NULL,
  title             text NOT NULL,
  tier              smallint NOT NULL,      -- 커리큘럼 단계 1~9
  difficulty        smallint NOT NULL,      -- 1~5 정적 난이도
  judge_mode        text NOT NULL,          -- 'tolerance'
  allowed_languages text[] NOT NULL,        -- Phase 1: ['python']
  entrypoint        varchar(40) NOT NULL,
  time_limit_ms     int NOT NULL DEFAULT 10000,
  memory_limit_mb   int NOT NULL DEFAULT 512,
  restrictions      jsonb NOT NULL,         -- 4.1.2 스펙
  compare_options   jsonb NOT NULL,         -- rtol, atol, equal_nan, require_dtype
  statement_md      text NOT NULL,
  is_published      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL
)

-- 테스트케이스
testcases (
  id         uuid PK,
  problem_id uuid FK -> problems,
  seq        int NOT NULL,
  is_public  boolean NOT NULL DEFAULT false,  -- 공개 예제 여부
  input_uri  text NOT NULL,
  expect_uri text NOT NULL,
  UNIQUE (problem_id, seq)
)

-- 제출
submissions (
  id              uuid PK,
  problem_id      uuid FK -> problems,
  user_id         uuid FK -> users NULL,
  anon_session_id uuid FK -> anon_sessions NULL,
  language        text NOT NULL,
  source          text NOT NULL,
  status          text NOT NULL,   -- PENDING|JUDGING|DONE
  verdict         text NULL,
  runtime_ms      int NULL,
  memory_mb       int NULL,
  failed_case_seq int NULL,
  detail          jsonb NULL,
  created_at      timestamptz NOT NULL,
  judged_at       timestamptz NULL,
  CHECK (num_nonnulls(user_id, anon_session_id) = 1)
)

-- 해결 기록 (랭킹 집계용 비정규화)
solved (
  user_id       uuid FK -> users,
  problem_id    uuid FK -> problems,
  first_ac_at   timestamptz NOT NULL,
  PRIMARY KEY (user_id, problem_id)
)

-- 유형 설명
concepts (
  id         uuid PK,
  slug       varchar(64) UNIQUE NOT NULL,
  title      text NOT NULL,
  tier       smallint NOT NULL,
  body_md    text NOT NULL,
  created_at timestamptz NOT NULL
)

-- 개념 ↔ 문제 양방향 링크
concept_problem_links (
  concept_id uuid FK -> concepts,
  problem_id uuid FK -> problems,
  relation   text NOT NULL,  -- 'prerequisite' | 'practice'
  PRIMARY KEY (concept_id, problem_id)
)

-- 태그
tags (id uuid PK, name varchar(32) UNIQUE NOT NULL)
problem_tags (problem_id uuid, tag_id uuid, PRIMARY KEY (problem_id, tag_id))
```

### 6.2 인덱스

```sql
CREATE INDEX ON submissions (problem_id, created_at DESC);
CREATE INDEX ON submissions (user_id, created_at DESC);
CREATE INDEX ON submissions (status) WHERE status <> 'DONE';
CREATE INDEX ON problems (tier, difficulty) WHERE is_published;
```

### 6.3 설계 노트

`solved` 테이블은 정규화 관점에서는 `submissions` 조회로 대체 가능하지만, 랭킹 페이지가 매번 전체 제출을 집계하는 비용을 피하기 위해 의도적으로 분리한다. 최초 `AC` 시에만 삽입한다.

IP는 원본을 저장하지 않고 서버 비밀키 기반 HMAC 해시만 보관한다. 익명 사용자 식별 목적에는 충분하며 개인정보 보관 위험을 줄인다.

---

## 7. API 명세

### 7.1 엔드포인트

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| `POST` | `/api/auth/register` | - | 회원가입 |
| `POST` | `/api/auth/login` | - | 로그인, 세션 쿠키 발급 |
| `POST` | `/api/auth/logout` | 필요 | 로그아웃 |
| `GET` | `/api/auth/me` | 선택 | 현재 사용자 또는 익명 세션 상태 |
| `GET` | `/api/problems` | 선택 | 목록. `tier`, `difficulty`, `tag`, `solved` 필터 |
| `GET` | `/api/problems/:slug` | 선택 | 상세 + 공개 예제 케이스 |
| `POST` | `/api/submissions` | 선택 | 제출 |
| `GET` | `/api/submissions/:id` | 선택 | 단건 조회 |
| `GET` | `/api/submissions` | 선택 | 최근 제출 목록 |
| `GET` | `/api/stream/submissions` | - | SSE 실시간 제출 스트림 |
| `GET` | `/api/concepts` | - | 유형 설명 목록 |
| `GET` | `/api/concepts/:slug` | - | 상세 + 연결된 문제 |
| `GET` | `/api/ranking` | - | 랭킹 |

### 7.2 제출 요청/응답

**요청**

```jsonc
POST /api/submissions
{
  "problem_slug": "matrix-broadcast-norm",
  "language": "python",
  "source": "def solve(a, b):\n    ..."
}
```

**응답 (202 Accepted)**

```jsonc
{
  "submission_id": "018f...",
  "status": "PENDING",
  "queue_position": 3
}
```

제출은 항상 비동기다. 클라이언트는 SSE 또는 폴링으로 결과를 수신한다.

**오류 응답**

| 상태 | 코드 | 조건 |
|---|---|---|
| 400 | `SOURCE_TOO_LARGE` | 64KB 초과 |
| 403 | `ANON_LIMIT_REACHED` | 익명 10문제 한도 도달 |
| 429 | `RATE_LIMITED` | 제출 빈도 제한 |
| 404 | `PROBLEM_NOT_FOUND` | 미공개 또는 부재 |

### 7.3 제출 빈도 제한

| 대상 | 제한 |
|---|---|
| 로그인 사용자 | 문제당 10초에 1회, 전체 분당 12회 |
| 익명 사용자 | 문제당 30초에 1회, 전체 분당 4회 |

채점 자원이 유한하므로 큐 앞단에서 반드시 차단한다.

### 7.4 SSE 스트림

```
GET /api/stream/submissions
Content-Type: text/event-stream

event: submission
data: {"id":"018f...","handle":"bryan","problem":"...","verdict":"AC","runtime_ms":21}
```

랭킹 트랙의 "실시간 제출 현황"에 사용한다. WebSocket 대신 SSE를 선택하는 이유는 단방향 브로드캐스트로 충분하고, 프록시·재연결 처리가 단순하기 때문이다.

익명 사용자의 제출은 스트림에 노출하지 않는다.

---

## 8. 인증 및 익명 세션

### 8.1 인증 방식

- 비밀번호 해시: **argon2id** (`memory=64MB, iterations=3, parallelism=4`)
- 세션: 서버 측 세션 ID를 HttpOnly·Secure·SameSite=Lax 쿠키로 전달
- JWT를 사용하지 않는다. Phase 1 규모에서 무상태성의 이득이 없고 세션 무효화가 어려워진다.

### 8.2 익명 세션 흐름

1. 최초 진입 시 서버가 익명 세션 레코드를 생성하고 서명된 쿠키를 발급
2. 제출 시 `anon_session_id`로 기록
3. **고유 문제 기준**으로 `solved_count`를 증가시킨다. 같은 문제에 여러 번 제출해도 1로 계산한다
4. 11번째 고유 문제 접근 시 `403 ANON_LIMIT_REACHED` 반환 및 가입 유도

### 8.3 계정 승계

로그인 또는 가입 시 쿠키에 익명 세션이 존재하면, 해당 세션의 제출 이력을 새 계정으로 재할당한다.

```sql
UPDATE submissions
   SET user_id = $newUser, anon_session_id = NULL
 WHERE anon_session_id = $anon;

INSERT INTO solved (user_id, problem_id, first_ac_at)
SELECT $newUser, problem_id, MIN(created_at)
  FROM submissions
 WHERE user_id = $newUser AND verdict = 'AC'
 GROUP BY problem_id
ON CONFLICT DO NOTHING;

UPDATE anon_sessions SET merged_user_id = $newUser WHERE id = $anon;
```

이 승계 기능은 전환율에 직접 영향을 준다. 10문제째에 "지금 가입하면 지금까지 푼 기록이 그대로 유지됩니다"를 노출하는 것이 설계 의도다.

### 8.4 우회 대응 수준

익명 제한은 쿠키 삭제와 시크릿 창으로 우회 가능하다. IP·UA 해시를 보조 지표로 병행하되 **완전 차단을 목표로 하지 않는다.** 이 기능의 목적은 방어가 아니라 가입 유도 마찰이며, 정상 사용자를 오탐으로 막는 비용이 우회 허용 비용보다 크다.

---

## 9. 문제 정의 포맷

문제는 파일 시스템 기반으로 정의하고 CLI로 DB에 적재한다. Git으로 버전 관리하기 위함이다.

```
problems/
  0102-gradient-descent-1d/
    problem.json
    statement.md
    reference.py           정답 구현 (기대값 생성용, 비공개)
    generator.py           테스트케이스 생성 스크립트
    cases/
      case_00.json
      expect_00.npz
```

**`problem.json`**

```jsonc
{
  "slug": "gradient-descent-1d",
  "title": "1차원 경사하강법 구현",
  "tier": 5,
  "difficulty": 2,
  "judge_mode": "tolerance",
  "allowed_languages": ["python"],
  "entrypoint": "solve",
  "time_limit_ms": 10000,
  "memory_limit_mb": 512,
  "compare_options": { "rtol": 1e-5, "atol": 1e-8, "equal_nan": false },
  "restrictions": {
    "allowed_imports": ["numpy", "math"],
    "forbidden_builtins": ["eval", "exec", "compile", "__import__", "open"],
    "required_entrypoint": "solve"
  },
  "tags": ["optimization", "numpy"],
  "concepts": [
    { "slug": "gradient-descent", "relation": "prerequisite" }
  ]
}
```

**적재 CLI**

```
node tools/problem-sync.js --dir problems/0102-gradient-descent-1d --publish
```

`generator.py`로 케이스를 생성하고 `reference.py`로 기대값을 산출한 뒤 DB에 반영한다. 기대값은 절대 손으로 작성하지 않는다.

---

## 10. 프론트엔드 구조

### 10.1 라우팅

| 경로 | 화면 |
|---|---|
| `/` | 랜딩 + 단계별 진입 |
| `/problems` | 문제집 목록 (필터) |
| `/problems/:slug` | 문제 상세 + 에디터 |
| `/concepts` | 유형 설명 목록 |
| `/concepts/:slug` | 개념 문서 + 연결 문제 |
| `/ranking` | 랭킹 + 실시간 제출 스트림 |
| `/users/:handle` | 사용자 프로필 |
| `/login`, `/register` | 인증 |

### 10.2 상태 관리 (Zustand)

| 스토어 | 책임 |
|---|---|
| `authStore` | 사용자/익명 세션, 남은 무료 문제 수 |
| `problemStore` | 목록 필터, 캐시 |
| `editorStore` | 코드 초안(문제별 로컬 보존), 언어 |
| `submissionStore` | 진행 중 제출 상태, SSE 구독 |

### 10.3 에디터

CodeMirror 6를 사용한다. Monaco는 번들 크기가 과하고 Phase 1에는 LSP가 필요 없다. Python 문법 강조와 자동 들여쓰기만 활성화한다.

작성 중인 코드는 문제별로 브라우저 로컬에 임시 보존하되, 이는 편의 기능이며 서버 신뢰 대상이 아니다.

### 10.4 제출 상태 표시

`PENDING` → `JUDGING` → 판정. 큐 대기 시 예상 순번을 표시한다. 채점이 수 초 걸리는 시스템에서 무한 스피너는 이탈을 유발한다.

---

## 11. 초기 문제 구성 (30문제)

Phase 1은 실행 시간 10초 내에 완결되는 단계만 다룬다.

| 단계 | 영역 | 문항 | 예시 |
|---|---|---|---|
| 1 | 수치·선형대수 | 10 | 브로드캐스팅 결과 shape, L2 norm, 행렬곱 직접 구현, 공분산 행렬 |
| 2 | 고전 ML | 8 | 정규방정식 선형회귀, KNN 분류, 로지스틱 시그모이드, 지니 불순도 |
| 4 | 평가·검증 | 7 | 혼동행렬, precision/recall/F1, ROC-AUC 직접 계산, 층화 분할 |
| 5 | 최적화 | 5 | 1차원 경사하강, 모멘텀, Adam 1스텝, 학습률 감쇠 |

3단계(전처리)는 데이터셋 파일 의존도가 높아 Phase 2로 미룬다. 6단계 이상은 실행 시간 문제로 제외한다.

**출제 원칙**

- 모든 문제는 `structural` 제한을 함께 갖는다. 라이브러리 한 줄로 풀리는 문제는 출제하지 않는다
- 입력 규모는 실행 시간이 1초를 넘지 않도록 설정한다. 10초 제한은 안전 마진이다
- 각 문제는 최소 1개의 공개 예제 케이스를 갖는다
- 각 문제는 최소 1개의 개념 문서와 연결된다

---

## 12. 비기능 요구사항

| 항목 | 목표 |
|---|---|
| 제출 접수 응답 | P95 < 300ms |
| 제출 → 채점 시작 | P95 < 2초 (큐 비적체 시) |
| 채점 완료 | P95 < 5초 |
| 워커 동시성 | 4 (단일 노드 코어 수 기준) |
| 시간당 처리량 | 약 2,800건 (4 × 3600 / 5) |
| 페이지 초기 로드 | LCP < 2.0초 |

Phase 1 예상 트래픽에서 처리량은 충분한 여유가 있다. 병목이 발생한다면 워커 노드 수평 확장으로 대응하며, 이는 큐 기반 구조상 코드 변경 없이 가능하다.

---

## 13. 운영

### 13.1 로깅

| 대상 | 보존 |
|---|---|
| API 접근 로그 | 30일 |
| 채점 실행 로그 (제출 ID, 판정, 시간, 메모리) | 영구 |
| 컨테이너 stderr | 실패 제출만 7일 |
| `IE` 발생 상세 | 영구 |

### 13.2 모니터링 지표

- 큐 대기 길이, 대기 시간 P95
- 판정 분포 (`IE` 비율이 0.5%를 넘으면 인프라 이상 신호)
- 워커 실패율, 컨테이너 생성 실패 횟수
- 익명 → 가입 전환율

### 13.3 백업

PostgreSQL 일 1회 전체 덤프. 문제 정의는 Git 저장소가 원본이므로 DB 손실 시 재적재로 복구 가능하다.

---

## 14. 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| 워커의 Docker 소켓 접근이 사실상 루트 권한 | 높음 | 워커를 최소 권한 전용 호스트에 격리, 향후 rootless Podman 전환 |
| AST 검사 우회 | 중간 | Phase 1은 무심코 사용 방지가 목표임을 명시, 향후 import hook 보완 |
| 컨테이너 콜드 스타트 지연 | 낮음 | 이미지 사전 pull, 200~400ms는 허용 |
| 부동소수점 허용 오차 논쟁 | 중간 | 문제별 오차 명시, 기준 구현으로 기대값 생성 |
| 익명 제한 우회 | 낮음 | 방어 목표 아님을 설계 전제로 수용 |
| 문제 30개로는 체류 시간 부족 | 중간 | 각 문제에 개념 문서를 연결해 학습 동선 제공 |

---

## 15. 마일스톤

| 단계 | 산출물 | 검증 기준 |
|---|---|---|
| M1 | 채점 컨테이너 + 러너 | CLI로 제출 1건을 채점하고 정확한 판정 반환 |
| M2 | API + 큐 + 워커 | HTTP 제출이 비동기 채점되어 DB에 기록 |
| M3 | 인증 + 익명 세션 | 10문제 제한과 계정 승계 동작 |
| M4 | 프론트엔드 3트랙 | 문제 풀이 전체 흐름 완주 |
| M5 | 문제 30개 + 개념 문서 적재 | 전 문제가 기준 구현으로 `AC` 판정 |
| M6 | 운영 배포 | 모니터링 지표 수집, 부하 시험 통과 |

M1을 최우선으로 완료한다. 채점 엔진이 검증되기 전에 프론트엔드를 진행하면 계약 변경 비용이 발생한다.

---

## 부록 A. 확장 지점 (Phase 2 이후)

이 문서의 설계는 다음 확장을 코드 구조 변경 없이 수용하도록 작성되었다.

| 확장 | 준비된 지점 |
|---|---|
| 언어 추가 | `problems.allowed_languages` 배열, 런타임 이미지 분리 |
| 채점 모드 추가 | `problems.judge_mode` 문자열, 러너 전략 분기 |
| 데이터셋 도입 | 컨테이너 볼륨 마운트 슬롯 |
| 워커 수평 확장 | 큐 소비자 추가만으로 가능 |
| 리더보드 | `submissions.detail` JSONB에 지표값 저장 |
| 레이팅 | `solved` 테이블 기반 사후 계산 |
