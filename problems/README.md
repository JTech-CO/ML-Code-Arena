# problems/ — 문제 정의

**M6 에서 30문제를 채운다.** 현재는 비어 있다.

문제는 파일 시스템으로 정의하고 CLI 로 DB 에 적재한다. Git 으로 버전 관리하기 위함이다
(`docs/TECHNICAL.md` §9).

~~~
problems/
  <NNNN-slug>/
    problem.json      메타·제한·비교 옵션
    statement.md      문제 설명
    reference.py      정답 구현 (기대값 생성용, 비공개)
    generator.py      테스트케이스 생성
    cases/            .gitignore 대상 — 커밋하지 않는다 (INV-2)
~~~

## 규칙

- `cases/` 는 커밋하지 않는다. `generator.py` 와 `reference.py` 로 재생성한다 (INV-2).
- 기대값은 **`reference.py` 로 생성**하며 손으로 작성하지 않는다 (INV-10).
  손으로 쓰면 부동소수점 자릿수·shape·dtype 이 미묘하게 어긋나고, 그 오류는 사용자가
  신고하기 전까지 발견되지 않는다.
- 모든 문제는 `restrictions` 를 필수로 갖는다 (ADR-0002).
