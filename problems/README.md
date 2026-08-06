# problems/ — 문제 정의와 개념 문서

문제는 파일 시스템으로 정의하고 CLI 로 DB 에 적재한다. Git 이 원본이고 DB 는 파생물이다
(`docs/TECHNICAL.md` §9).

~~~
problems/
  _concepts/<slug>.md        개념 문서. frontmatter 로 slug·title·tier
  <NNNN-slug>/
    problem.json             메타·제한·비교 옵션·태그·개념 링크
    statement.md             문제 설명 (공개)
    reference.py             정답 구현. 기대값 생성용, 비공개
    generator.py             테스트케이스 생성. 시드 고정
    bypass.py                라이브러리 한 줄 풀이. FBD 를 받아야 한다
    cases/                   .gitignore 대상 — 커밋하지 않는다 (INV-2)
~~~

`NNNN` 은 전역 순번이며 단계·난이도 순으로 매긴다. **출제 순서를 사람이 읽기 위한
것이지 화면에 나오는 번호가 아니다** — 목록의 `#` 열은 `(tier, difficulty, slug)` 정렬
위치이므로 같은 단계·난이도 안에서는 순서가 다를 수 있다.

## 왜 `bypass.py` 가 문제 정의의 일부인가

`docs/TECHNICAL.md` §9 의 레이아웃에는 없지만 여기서는 필수 파일이다.

이 플랫폼의 존재 이유는 "라이브러리 한 줄로 풀리지 않게 하는 것"이다(ADR-0002).
제한을 걸어 두는 것과 그 제한이 **실제로 우회를 막는 것**은 다른 명제다. 문제마다
우회 샘플을 함께 두고 `FBD` 를 받는지 확인하지 않으면, 제한 목록에 오타가 있어도
아무도 모른다. `pnpm judge:batch -- --source bypass` 가 전 문제에 대해 이를 검사한다.

## 명령

~~~bash
pnpm problems:sync                    # 케이스 생성 + DB 적재
pnpm problems:sync -- --verify        # 기대값 재생성 후 해시 대조 (INV-10)
pnpm problems:report                  # 단계 분포·제한 누락·예제 누락
pnpm judge:batch -- --source reference   # 30/30 AC 기대
pnpm judge:batch -- --source bypass      # 30/30 FBD 기대
~~~

## 규칙

- **기대값을 손으로 쓰지 않는다** (INV-10). `WA` 가 나면 `reference.py` 를 고치고 재생성한다.
- `cases/` 는 커밋하지 않는다 (INV-2). `generator.py` 와 `reference.py` 로 재생성된다.
- 케이스 생성은 **컨테이너 안에서** 돈다. 호스트 numpy 로 만들면 버전 차이로 정답이
  `WA` 가 된다 — M1 에서 실측했다.
- 모든 문제는 `restrictions.allowed_imports` 를 갖는다 (ADR-0002). 제한이 선택이면
  출제자가 빠뜨리고, 빠뜨린 문제는 라이브러리 한 줄로 풀린다.
- 입력 규모는 기준 구현이 **1초 미만**에 끝나도록 잡는다. 10초 제한은 안전 마진이다.
