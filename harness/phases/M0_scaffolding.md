# M0 — 기반/스캐폴딩

**상태**: 완료 · DoD 5/5 통과 (저장소 경로에서 재현 확인)  **갱신**: 2026-08-06

## 맥락
이후 모든 phase가 의존하는 모노레포·도구·경계를 세운다. 이 프로젝트는 web·api·worker가 같은 타입을 공유하되 서로를 import하면 안 되는 구조이므로, 경계 룰을 여기서 실효화하지 않으면 INV-3 위반이 누적된다.

## 진입조건 (DoR)
- [x] `docs/ENVIRONMENT.md`의 사전 요구 충족 — **편차 있음**: Node v25.2.0(문서 22 LTS), pnpm 11.5.3(문서 9.x), Docker 29.6.2(충족). `engines`는 `node>=22`/`pnpm>=9`, `.nvmrc`·CI는 22로 고정. Postgres·Redis는 M2/M3 진입 전 확인
- [x] `docs/FILE_TREE.md`의 디렉터리·경계 규칙 확인
- [x] INV-1·INV-2·INV-3 확인

## 할 일
pnpm 워크스페이스 설정 -> `packages/shared`(타입·판정 상수) -> `apps/api` -> `apps/worker` -> `apps/web`(Vite) -> eslint 경계 룰(`import/no-restricted-paths`) -> JSDoc 기반 타입체크(`checkJs`) -> `.gitignore` -> 기본 CI(빌드·린트·타입체크).

`judge/` 는 Python이므로 JS 워크스페이스에 포함하지 않는다. 별도 디렉터리로 둔다.

## 참조
`docs/FILE_TREE.md` §1·§3, `docs/ENVIRONMENT.md` §1·§4, INV-1·INV-2·INV-3.

## DoD (완료 게이트)
1. `pnpm build` / `pnpm typecheck` / `pnpm lint` 전부 그린.
2. `apps/web`에서 `apps/api`를 import하는 샘플 파일 작성 시 **lint 에러로 차단**됨(INV-3 준수) — 의도적 위반 샘플로 확인 후 제거.
3. `packages/shared`가 어떤 앱도 import하지 않음 — 역방향 위반 샘플로 확인.
4. `.gitignore`가 `.env`·`node_modules`·빌드물·`problems/*/cases/`를 제외(INV-1·INV-2 준수).
5. 판정 코드 8종(`AC` `WA` `TLE` `MLE` `RE` `CE` `FBD` `IE`)이 `packages/shared`에 단일 상수로 정의되어 있다.

## 검증
~~~
pnpm build && pnpm typecheck && pnpm lint
# 경계 위반 샘플 생성 → pnpm lint → 에러 1건 확인 → 샘플 제거
git check-ignore -v .env
~~~

## 증거

저장소 루트(`C:\Users\MSI\Desktop\ml-code-arena`)에서 `pnpm install --frozen-lockfile` 후 실행.
5개 게이트 연속 실행 결과 `TOTAL_FAILURES=0`.

~~~
$ pnpm build        → PASS   apps/web: vite v7.3.6, 30 modules, dist/assets/index-BgXC0r2_.js 144.47 kB (gzip 46.89 kB)
$ pnpm typecheck    → PASS   packages/shared · apps/web · apps/worker · apps/api 4/4 Done
$ pnpm lint         → PASS   eslint . 에러 0건
$ pnpm test         → PASS   node --test: tests 13, pass 13, fail 0
$ pnpm check:boundaries → PASS  경계 샘플 8건 중 8건 차단됨
~~~

### DoD 1 — 빌드·타입체크·린트 그린
위 4개 명령 전부 exit 0. 5개 게이트 연속 실행 `TOTAL_FAILURES=0`.

### DoD 2·3 — 경계 룰이 실제로 위반을 막는가 (INV-3)
`node tools/check-boundaries.js` 가 의도적 위반 샘플 8건을 생성 → 린트 → 차단 확인 → 삭제한다.
샘플 잔여 파일 0건 확인.

~~~
[BLOCKED] apps/web → apps/api (상대 경로)                   import/no-restricted-paths
[BLOCKED] apps/web → @mlca/api (패키지 이름)                no-restricted-imports
[BLOCKED] apps/api → apps/worker (상대 경로)                import/no-restricted-paths
[BLOCKED] apps/worker → apps/api (상대 경로)                import/no-restricted-paths
[BLOCKED] packages/shared → apps/api (역방향, 상대 경로)     import/no-restricted-paths
[BLOCKED] packages/shared → @mlca/api (역방향, 패키지 이름)  no-restricted-imports
[BLOCKED] packages/shared → 외부 의존 (순수성 위반)          import/no-extraneous-dependencies
[BLOCKED] apps/worker → judge/                              import/no-restricted-paths
경계 샘플 8건 중 8건 차단됨.
~~~

상대 경로와 패키지 이름 **두 우회 경로를 모두** 검사한다. 룰 하나만으로는 한쪽이 열린다.

> 검증 과정에서 실제로 한 건이 새어 나갔다(`packages/shared → fastify`). 원인은 룰이 아니라
> 샘플이었다. `import/no-extraneous-dependencies` 는 **해석되지 않는** import 를 조용히 건너뛰는데,
> pnpm 의 격리된 node_modules 때문에 `fastify` 가 shared 에서 해석되지 않아 룰이 발화하지 않았다.
> 샘플을 루트에서 해석되는 패키지(`typescript`)로 바꿔 룰이 실제로 발화함을 확인했다.
> "차단됐다"와 "검사를 안 했다"는 출력이 같다는 점이 이 게이트의 함정이다.

### DoD 4 — `.gitignore` (INV-1·INV-2)
~~~
$ git check-ignore -v .env
.gitignore:2:.env	.env
$ git status --porcelain --ignored=matching -- .env .env.example
?? .env.example      (추적 대상 — 의도)
!! .env              (무시 — INV-1)
~~~
`node_modules/` · `dist/` · `problems/*/cases/` · `__pycache__/` 도 무시 확인.

### DoD 5 — 판정 코드 8종 단일 정의
`packages/shared/src/verdict/index.js` 의 `VERDICTS` 1곳. `pnpm test` 13건이 백서 §4.3 표와
순서까지 대조하고, `VERDICT` 맵·`VERDICT_META` 가 목록에서 갈라지지 않는지, 동결 여부,
`IE` 만 통계 제외·자동 재시도 대상인지를 검사한다.

## 막힘 (STOP) — 저장소 경로에서 `pnpm install` 크래시 → **해결됨 (경로 이전)**

**해결**: 저장소를 `C:\Users\MSI\Desktop\내 폴더\대형 프로젝트\ML Code Arena` 에서
`C:\Users\MSI\Desktop\ml-code-arena` 로 이전했다(2026-08-06, 사용자 승인). `.git` 포함 이전이며
이전 직후 `pnpm install --frozen-lockfile` 과 5개 게이트 전부 통과를 저장소 경로에서 확인했다.
**저장소를 다시 비ASCII 경로로 옮기면 재발한다.** 기록은 아래에 남긴다.

**증상**: 저장소 루트에서 `pnpm install` 이 링크 단계에서 종료 코드 `-1073740791`
(`0xC0000409` = STATUS_STACK_BUFFER_OVERRUN)로 죽는다. `node_modules/.pnpm` 은 생성되지만
최상위 `node_modules` 링크가 만들어지지 않아 어떤 게이트도 실행할 수 없다.

**재현**: 저장소 루트에서 `pnpm install`. 100% 재현.

**시도한 것 (전부 실패, 동일 크래시)**
1. `node_modules` 전체 삭제 후 재설치
2. `--node-linker=hoisted`
3. `--package-import-method=copy`
4. pnpm 11.20.0 (`npx pnpm@11.20.0 install`)

**원인 좁히기 (전부 성공 = 원인 아님)**
| 조건 | 결과 |
|---|---|
| 한글 경로 + 의존성 소량(eslint만) | 성공 |
| 공백 포함 ASCII 경로 | 성공 |
| Desktop 하위 ASCII 경로 + 전체 의존성 | 성공 |
| 임시 폴더 ASCII 경로 + 전체 의존성 | 성공 |
| **한글 경로 + 전체 의존성(319 패키지)** | **크래시** |

Desktop·OneDrive·공백·경로 길이·pnpm 버전·링커 모드는 전부 원인이 아니다.
**비ASCII 경로와 이 의존성 집합의 조합**에서만 pnpm 의 네이티브 링커가 죽는다.

**부수 이득**: M1 이 `docker run -v <호스트경로>:/judge:ro` 로 호스트 경로를 컨테이너에
마운트하므로, Windows + Docker Desktop 환경에서 ASCII 경로는 M0 해소를 넘어 M1 리스크도 줄인다.

## 롤백 계획
스캐폴딩을 커밋 단위로 분리(워크스페이스 / 린트·타입 / CI). 설정 오류 시 해당 커밋만 revert.

## 리스크 / 미지수
- ~~경계 룰이 느슨하면 M3~M5에서 위반이 누적되어 발견이 늦어진다.~~
  → `pnpm check:boundaries` 를 CI 에 넣어 매 커밋 실효를 확인한다. 룰이 조용히 비활성화되면 즉시 빨간불.
- ~~JSDoc + `checkJs` 조합이 워크스페이스 간 타입 참조에서 불편할 수 있다.~~
  → `tsconfig.base.json` 의 `paths` 로 `@mlca/shared` 를 소스에 직접 매핑해 해결. 선행 빌드나
  `.d.ts` 산출물이 필요 없고, ADR 을 남길 만큼의 결정도 아니었다.
- `import/no-unresolved` 는 끄고 `tsc` 의 TS2307 에 맡겼다. 구형 node 리졸버가 `exports` 전용
  ESM 패키지(vite 등)를 못 찾아 오탐이 나고, 해결하려면 네이티브 바이너리 리졸버가 필요하다.
  M5 에서 CodeMirror·Zustand 등이 들어와도 같은 판단이 유지되는지 확인할 것.
- pnpm 11 은 `pnpm-workspace.yaml` 을 스스로 다시 쓰면서 **비ASCII 주석을 깨뜨린다**(실측).
  이 파일은 ASCII 로만 유지한다. 설정 키도 pnpm 10 의 `onlyBuiltDependencies` 가 아니라
  pnpm 11 의 `allowBuilds` 다.

## 주의
설정이 "돈다"고 완료가 아니다. 경계 룰이 **실제로 위반을 막는지** 샘플로 확인할 것. 판정 코드 상수를 `shared`에 두지 않으면 이후 러너·API·UI 세 곳에서 문자열이 갈라진다.
