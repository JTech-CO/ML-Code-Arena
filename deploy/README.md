# deploy/ — 단일 호스트 배포

Phase 1 은 노드 하나에 전부 올린다 (`docs/TECHNICAL.md` §12).

~~~
호스트
├── systemd  mlca-worker.service       채점 워커 (Node)
│      └── docker run mlca-python:3.11  제출 1건당 1개, 즉시 파기 (INV-8)
└── docker compose --env-file .env -f deploy/compose.yml
       ├── caddy      :80/:443   정적 web + /api 프록시
       ├── api        :3000      Fastify (내부 네트워크만)
       ├── postgres   16
       └── redis      7
~~~

## 워커가 왜 compose 밖에 있는가 (ADR-0007)

워커는 Docker 소켓이 필요하다. 채점 컨테이너를 만드는 것이 그 일이기 때문이다.
소켓을 **컨테이너 안으로 넣지 않고** 워커를 호스트 프로세스로 두는 쪽을 골랐다.

이유는 보안 등급보다 **검증한 것과 배포하는 것을 같게** 두는 데 있다. M1~M6 의 격리
게이트 25건이 전부 "워커는 호스트 프로세스, 채점 대상만 컨테이너" 형태에서 통과했다.
워커를 컨테이너로 옮기면 통과한 적 없는 형태로 배포하게 된다.

기술적인 이유도 하나 있다. 워커가 `-v <경로>:/judge` 를 지정하면 그 경로는 **호스트
데몬이 해석한다** — 워커 컨테이너 안의 경로가 아니다. 소켓을 마운트한 워커에서는 작업
디렉터리를 호스트와 동일한 절대경로로 bind mount 해야 하고, 어긋나면 채점이 조용히 빈
디렉터리를 읽는다. 호스트 프로세스에는 이 함정이 없다.

**남은 위험을 숨기지 않는다**: `docker` 그룹 소속은 사실상 호스트 루트 권한이다.
줄인 것은 노출면(컨테이너 안에 소켓이 없다)이지 권한 자체가 아니다. rootless Docker 로
가는 길은 열려 있다 — 데몬만 바꾸면 되고 워커 코드는 그대로다. 다만 rootless 에서
`--pids-limit`·`--memory` 가 실제로 걸리는지 확인하기 전에는 옮기지 않는다.
확인 없이 옮기면 M1 게이트가 깨진 채로 도는 상태가 된다.

## 파일

| 파일 | 용도 |
|---|---|
| `compose.yml` | caddy · api · postgres · redis |
| `Dockerfile.api` | API 이미지 (멀티스테이지 pnpm 빌드) |
| `Dockerfile.web` | web 정적 빌드 → caddy 이미지 |
| `Caddyfile` | 정적 서빙 + `/api` 프록시 + SSE 무버퍼 |
| `mlca-worker.service` | 워커 systemd 유닛 |
| `env.production.example` | 운영 환경변수 서식. **값은 비어 있다** (INV-1) |

## 절차

`docs/ENVIRONMENT.md` §7 을 따른다. 이 디렉터리의 파일을 직접 실행하는 절차는 없다 —
문서 한 곳만 보고 배포할 수 있어야 한다.
