# M4 — 디자인 토큰 + AppShell

**상태**: 완료 · DoD 8/8 통과  **갱신**: 2026-08-06

## 맥락
토큰이 흔들리면 이후 컴포넌트를 전부 다시 손대야 하므로 프론트엔드의 첫 phase로 둔다. 라이트/다크 두 모드가 처음부터 함께 성립해야 한다 — 나중에 다크를 얹으면 하드코딩된 색을 전부 찾아내야 한다.

## 진입조건 (DoR)
- [x] M3 DoD 통과 (API 계약 확정)
- [x] `docs/DESIGN.md` §3(색)·§4(타이포)·§5(간격)·§8(테마) 정독
- [x] INV-11·INV-12 확인, ADR-0006 확인

## 할 일
`tokens.css`(라이트/다크 변수) -> FOUC 방지 인라인 스크립트 -> `ThemeToggle` -> Pretendard·JetBrains Mono 로드 -> `.mono` 유틸(tabular-nums) -> `AppShell`(상단 내비 + 사이드바 슬롯) -> 3트랙 라우팅 -> 대비 자동 검사 스크립트.

## 참조
`docs/DESIGN.md` §3·§4·§5·§8·부록 A, `decisions/0006-light-default-no-auto-scheme.md`, INV-12.

## DoD (완료 게이트)
1. 라이트/다크 전환이 동작하고 선택이 `localStorage`에 유지된다.
2. **기본값이 라이트다.** OS가 다크 설정이어도 저장값이 없으면 라이트로 뜬다(ADR-0006 준수).
3. 새로고침 시 테마 깜빡임(FOUC)이 없다 — 인라인 스크립트가 CSS·번들보다 먼저 실행됨을 확인.
4. 대비 자동 검사 스크립트가 라이트·다크 양쪽 전 토큰 조합에서 통과한다(INV-12 준수). 다크 배경이 `#000`이 아님을 포함.
5. 하드코딩된 색상값(`#`로 시작하는 리터럴)이 `tokens.css` 외 컴포넌트 파일에 0건.
6. 3트랙 라우팅이 동작하고 활성 트랙이 하단 2px 밑줄로 표시된다.
7. `prefers-reduced-motion: reduce` 에서 모든 트랜지션이 무력화된다.
8. font-family가 2종을 넘지 않는다.

## 검증
~~~bash
pnpm --filter @mlca/web run build
pnpm check:contrast    # 라이트·다크 전 조합 112건 (INV-12)
pnpm check:design      # 색 리터럴 + §12 금지 목록 + 서체 종수
pnpm dev:web           # 브라우저에서 토글·라우팅 확인
~~~

## 증거

브라우저 실측은 Vite dev 서버(5173)에서 계산된 스타일과 DOM 상태로 확인했다.
"보기에 괜찮다"가 아니라 실제 값이다.

### DoD 2 — 기본값이 라이트 (ADR-0006)
~~~
osPrefersDark : true        ← 이 머신의 OS 는 실제로 다크 설정이다
storedTheme   : null
dataTheme     : "light"
--bg-canvas   : #ffffff
~~~
OS 가 다크인데도 저장값이 없어 라이트로 뜬다. `prefers-color-scheme` 를 읽지 않는
설계가 실환경에서 확인됐다.

### DoD 1 — 전환과 지속
~~~
토글 후 : dataTheme=dark  localStorage=dark  --bg-canvas=#16181c  aria-label="라이트 모드로 전환"
새로고침 후 : dataTheme=dark  localStorage=dark  --bg-canvas=#16181c
~~~
`aria-label` 은 현재 상태가 아니라 전환 후 상태다 — 버튼의 이름은 눌렀을 때 일어나는 일이어야 한다.

### DoD 3 — FOUC 없음
dev 서버는 CSS 를 JS 로 주입하므로 차단 스타일시트가 없다. **프로덕션 빌드**로 확인했다.
~~~
apps/web/dist/index.html 내 문자 위치
  FOUC 인라인 스크립트 : 701
  번들 module script   : 945
  첫 stylesheet link   : 1023
  → 인라인 < 번들 < 스타일시트
~~~

### DoD 4 — 대비 (INV-12)
~~~
$ pnpm check:contrast
토큰 대비 검사 — 조합 112건 (라이트·다크)
전 조합 4.5:1 이상 통과. 다크 배경 #16181c (순수 검정 아님).
~~~
`--bg-canvas` 위 최저값: 라이트 5.23:1(`--text-muted`), 다크 5.62:1(`--text-muted`).
전 배경 조합 최저값: 라이트 4.57:1, 다크 4.56:1.

### DoD 5 — 색 리터럴 격리
~~~
$ pnpm check:design
디자인 린트 — 파일 11개
  font-family 종류: 2 (sans, mono)
  위반 0건
$ git grep -nE "#[0-9a-fA-F]{3,6}" -- "apps/web/src/**/*.jsx"
(0건)
~~~
린트는 `.jsx` 뿐 아니라 `.css` 도 본다. 백서의 grep 은 `.jsx` 만 보므로 CSS 모듈에
색을 직접 쓰면 통과해버린다 — 실제로 색이 새기 쉬운 곳은 그쪽이다.

### DoD 6 — 활성 트랙 표시
~~~
활성   border-bottom: 2px  rgb(31,95,168)  (= --accent)
비활성 border-bottom: 2px  rgba(0,0,0,0)   (자리만 확보)
활성이 볼드인가 : false      배경 채움 : rgba(0,0,0,0)
~~~
비활성도 2px 투명 테두리를 두어 활성화될 때 글자가 밀리지 않는다.
표시 수단은 밑줄 하나뿐이다 — 셋이면 어느 것이 활성 신호인지 흐려진다.
라우트를 `/ranking` 으로 옮기면 밑줄도 따라간다(다크에서 `rgb(91,155,224)`).

### DoD 7 — `prefers-reduced-motion`
OS 설정을 에이전트가 바꿀 수 없어, CSSOM 에서 규칙을 확인하고 **같은 선언을
`media: all` 로 주입해 효과를 측정**했다.
~~~
규칙 : @media (prefers-reduced-motion: reduce) { *, ::before, ::after { ... } }
선언 : transition-duration:.01ms!important; animation-duration:.01ms!important;
       animation-iteration-count:1!important; scroll-behavior:auto!important
계산된 transition-duration : 0.12s → 1e-05s (적용 중) → 0.12s (제거 후)
~~~

### DoD 8 — 서체 2종
`--font-sans`(Pretendard) + `--font-mono`(JetBrains Mono). 린트가 종수를 센다.
npm 패키지로 자체 호스팅한다 — CDN 을 타면 오프라인 개발이 깨지고 첫 렌더가 외부 응답에 묶인다.

### 반응형·확대
~~~
1280px : 가로 스크롤 없음
375px  : 가로 스크롤 없음, 트랙 3개 전부 노출, 좌우 여백 16px
640px  : 가로 스크롤 없음  (1280px 를 200% 확대한 유효 폭)
320px  : 가로 스크롤 없음, 넘치는 요소 0  (WCAG reflow 기준)
~~~

## 롤백 계획
토큰은 단일 파일이므로 `tokens.css` 커밋만 revert하면 복구된다. 컴포넌트가 변수만 참조하므로 연쇄 수정이 없다.

## 이 phase 에서 잡은 것

**백서의 토큰 3개가 INV-12 를 위반하고 있었다.** §3.5 의 대비표가 `--bg-canvas` 위에서만
만들어져 있어, canvas 밖 배경에서 미달하는 것을 놓쳤다.

| 토큰 | 초안 | 최저 대비 | 정정 |
|---|---|---|---|
| `--text-muted` (light) | `#6B737D` | 4.20:1 on `--bg-inset` | `#666D77` |
| `--text-muted` (dark) | `#7C858F` | 3.85:1 on `--bg-hover` | `#88929C` |
| `TLE`·`MLE` (light) | `#9A6206` | 4.46:1 on `--bg-inset` | `#986006` |

`--bg-subtle` 은 페이지 바탕, `--bg-inset` 은 코드 블록·입력 필드, `--bg-hover` 는 행
호버다 — muted 텍스트가 **가장 많이 얹히는 자리들**이다. 색상은 유지하고 명도만 5~9%
옮겼다. `docs/DESIGN.md` §3.2·§3.3·§3.4·§3.5 를 실측값으로 정정했고, §3.5 에 검증 대상이
`--bg-canvas` 하나가 아니라 **텍스트 × 배경 전 조합**임을 명시했다.

이것이 자동 검사를 만든 이유다. 눈으로 봤다면 라이트가 멀쩡해서 그냥 넘어갔을 것이다.

## 리스크 / 미지수
- ~~다크 모드 판정 색 5종이 `--bg-canvas` 위에서 전부 4.5:1을 넘는지 실측 필요.~~
  → 전 조합 112건 자동 검사로 대체. CI 에 포함했다.
- Pretendard와 JetBrains Mono의 시각 크기 차이 보정(`0.9375em`)은 토큰에 반영했으나
  **실제 렌더 비교는 M5 에서 mono 를 쓰는 화면(문제 번호·정답률·판정 코드)이 생긴 뒤**에야
  의미가 있다. 지금은 비교할 대상이 없다.
- 브라우저 패널이 표시되지 않아 스크린샷을 남기지 못했다. 계산된 스타일과 DOM 상태로
  대체했으며, 시각적 검수는 M5 의 D8(접근성 검수) 시점에 함께 한다.
- `apps/web` 만 `exactOptionalPropertyTypes` 를 껐다. CSS 모듈 클래스명이
  `string | undefined` 가 되는데 React 의 prop 타입은 그 구분을 하지 않는 관례로 쓰여 있다.
  우리 코드의 안전성 문제가 아니라 플래그와 생태계 관례의 불일치다. api·worker·shared 는
  켜 둔 채이며 거기서는 실제 값을 잡아냈다.

## 주의
컴포넌트 파일에 색을 직접 쓰는 순간 다크 모드가 조용히 깨진다. 게이트 5번은 형식 검사가 아니라 실질 방어다.
