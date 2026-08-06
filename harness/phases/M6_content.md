# M6 — 문제 30개 + 개념 문서 ★

**상태**: 완료 (DoD 9/9)  **갱신**: 2026-08-07

## 맥락
**핵심 기능 실효 검증 phase.** 앞의 모든 phase가 "시스템이 돈다"를 검증했다면 여기는 "플랫폼이 실제로 쓸 만한가"를 검증한다. 문제 30개가 전부 정확히 채점되지 않으면 서비스를 열 수 없다.

## 진입조건 (DoR)
- [x] M5 DoD 통과
- [x] `docs/TECHNICAL.md` §9(문제 정의 포맷)·§11(초기 문제 구성) 정독
- [x] INV-10 확인
- [x] `tools/problem-sync.js` 동작 확인 — 이 phase 에서 새로 만들었다

## 할 일
`tools/problem-sync.js`(적재·검증 CLI) -> 1단계 수치·선형대수 10문제 -> 2단계 고전 ML 8문제 -> 4단계 평가·검증 7문제 -> 5단계 최적화 5문제 -> 개념 문서 작성 -> 개념↔문제 링크 연결.

각 문제는 `problem.json` + `statement.md` + `reference.py` + `generator.py` + 공개 예제 1건 이상을 갖춘다.

### 규약에 더한 것

**`bypass.py` 를 문제 정의의 필수 파일로 넣었다.** §9 의 레이아웃에는 없지만 DoD 5번이
문제별 우회 샘플을 요구하고, 그 샘플이 문제 옆에 없으면 제한을 고칠 때 함께 고쳐지지
않는다. 제한을 걸어 두는 것과 그 제한이 실제로 우회를 막는 것은 다른 명제다.

**개념 문서는 `problems/_concepts/<slug>.md` 에 둔다.** §9 는 개념 문서의 위치를 정하지
않았다. 문제와 같은 트리에 두어야 링크가 끊긴 것을 한 곳에서 볼 수 있다.

### AST 검사에 더한 두 규칙

문제를 쓰다가 기존 검사로는 성립하지 않는 문제가 나와 규칙을 두 개 추가했다.

- `forbidden_operators` — `numpy.matmul`·`numpy.dot` 을 전부 막아도 `a @ b` 한 줄이
  남으면 "행렬 곱을 직접 구현하라"는 문제가 성립하지 않는다.
- `forbidden_attributes` 의 `.이름` 형태 — `numpy.mean` 을 막아도 `x.mean()` 이 남는다.
  `x` 는 사용자가 정한 변수 이름이라 경로로는 잡히지 않는데, numpy 배열은 거의 모든
  함수를 메서드로도 제공한다. 경로만 막는 제한은 절반만 막는 제한이었다.

두 규칙 모두 검사를 **좁히는** 방향이며 기존 문제의 판정을 바꾸지 않는다.

## 참조
`docs/TECHNICAL.md` §9·§11, INV-10.

## DoD (완료 게이트)
1. [x] 문제 30개가 적재되고 목록·상세가 전부 렌더된다.
2. [x] **모든 문제의 `reference.py` 제출이 `AC` 를 받는다.** 30/30. 하나라도 `WA`면 그 문제의 기대값이 잘못된 것이다.
3. [x] `problem-sync --verify` 로 전 문제 기대값을 재생성했을 때 저장된 값과 해시가 일치한다(INV-10 준수).
4. [x] **모든 문제가 `structural` 제한을 갖는다.** `restrictions.allowed_imports`가 비어 있는 문제 0건.
5. [x] 각 문제에 대해 "라이브러리 한 줄 풀이" 샘플이 `FBD` 를 받는다 — 문제별 우회 샘플 30건 전부 차단.
6. [x] 모든 문제의 `reference.py` 실행 시간이 **1초 미만**이다. 10초 제한은 안전 마진이며 정상 풀이가 이를 소진하면 안 된다.
7. [x] 각 문제에 공개 예제 케이스가 1건 이상 있다.
8. [x] 각 문제가 개념 문서 1건 이상과 연결되고, 양방향 이동이 동작한다.
9. [x] 단계 분포가 계획과 일치한다 — 1단계 10 / 2단계 8 / 4단계 7 / 5단계 5.

## 검증
~~~
node tools/problem-sync.js --all --verify
node tools/batch-judge.js --source reference     # 30/30 AC 기대
node tools/batch-judge.js --source bypass        # 30/30 FBD 기대
node tools/problem-sync.js --report              # 단계 분포·제한 누락·예제 누락 점검
~~~

## 증거

### 게이트 2·3·5·6·9 — 검증 명령
~~~
$ node tools/problem-sync.js --all --verify
[30/30] numerical-gradient         일치  케이스 11건     1ms

기준 구현 최장  knn-classify 12ms  (상한 1000ms)
검증 통과 — 30문제의 기대값이 재생성 결과와 일치한다 (INV-10)

$ node tools/batch-judge.js --source reference
30/30 이 AC · 21.4s

$ node tools/batch-judge.js --source bypass
30/30 이 FBD · 18.1s

$ node tools/problem-sync.js --report
문제 30건 · 개념 22건
1단계  10/10
2단계   8/8
4단계   7/7
5단계   5/5
점검 통과 — 필수 항목·개념 링크·단계 분포 이상 없음
~~~

기준 구현 최장이 12ms 다. 상한 1000ms 의 1.2% 이며 10초 제한과는 세 자릿수 차이다
(게이트 6).

### 게이트 1·4·7·8 — 적재와 화면
~~~
$ pnpm problems:sync
적재 완료 — 문제 30건 · 개념 22건 · 링크 36건 (공개)
  정리  stream-user (제출 1건 — 미공개 처리)

$ psql -c "SELECT tier, count(*) FROM problems WHERE is_published GROUP BY tier ORDER BY tier"
 tier | count
------+-------
    1 |    10
    2 |     8
    4 |     7
    5 |     5

$ psql -c "SELECT count(DISTINCT problem_id) FROM concept_problem_links"
 30                       -- 개념이 붙지 않은 문제 0건 (게이트 8)

$ curl /api/problems?limit=50
총 30 건 · 단계별 {"1":10,"2":8,"4":7,"5":5}
허용 목록이 빈 문제: 0        -- 게이트 4

$ curl /api/problems/power-iteration
문제→개념: [{"slug":"eigen","title":"고윳값과 거듭제곱법","relation":"prerequisite"}]
예제 절 있음: true            -- 게이트 7
기대값성 필드: []              -- INV-5

$ curl /api/concepts/eigen
개념 eigen → 문제: power-iteration(prerequisite)   -- 게이트 8 역방향
~~~

목록 화면(`/problems`)에 `30 / 30` 과 30행이 뜬다. 상세(`/problems/power-iteration`)에
제한 칩 7건·설명·개념 링크가 렌더되고 본문 가로 스크롤이 없다.

### 게이트 5 가 실제로 무는지 — 종단 확인
브라우저에서 `POST /api/submissions` 로 직접 넣어 큐·워커를 태웠다.

~~~
gini-impurity  + np.bincount 풀이  -> FBD
  forbidden_attribute: 이 문제는 `numpy.bincount` 사용이 금지되어 있습니다. (5행)
confusion-matrix + 손으로 센 풀이  -> AC (1ms)
~~~

### 검사 범위가 실제로 30문제에 걸리는지 — 결정적 확인
`judge/tests` 의 `ProblemDefinitionTest` 를 `problems/` 까지 보도록 넓혔다. 넓혔다고
주장하는 대신 문제 하나를 일부러 깨뜨려 확인했다.

~~~
$ # problems/0002-l2-normalize/reference.py 를 np.linalg.norm 을 쓰도록 바꾼 뒤
$ node tools/judge-fixtures.js
[FAIL] 러너 단위 테스트 (컨테이너 안, 고정 numpy)
       0002-l2-normalize: 기준 구현이 제한에 걸린다 — 제한을 잘못 걸었다
       Ran 51 tests / FAILED (failures=1)

$ # 되돌린 뒤
[PASS] 러너 단위 테스트 (컨테이너 안, 고정 numpy)
       51건 통과
~~~

### 회귀 — 앞 phase 게이트
~~~
$ node tools/judge-fixtures.js       게이트 25건 중 25건 통과
$ pnpm build && pnpm typecheck && pnpm lint && pnpm test    전부 통과
$ pnpm check:boundaries              경계 샘플 8건 중 8건 차단됨
~~~

## 롤백 계획
문제 정의는 Git이 원본이고 DB는 파생물이다. DB 오적재 시 `pnpm problems:sync` 로 재적재한다
(`ON CONFLICT DO UPDATE` 이므로 재실행이 곧 덮어쓰기다 — 별도 `--force` 플래그를 두지
않았다. 계획에 적힌 `--all --force` 는 이 플래그로 대체된 것이 아니라 불필요해진 것이다).

**커밋 분리는 계획과 다르게 했다.** 계획은 "문제당 커밋"이었으나 단계당 커밋 4건으로
묶었다. 문제 하나를 되돌리는 데 필요한 것은 커밋 경계가 아니라 **파일 독립성**이고,
`problems/<NNNN-slug>/` 는 서로를 참조하지 않는다. 한 문제를 빼려면
`git rm -r problems/<dir>` 후 `pnpm problems:sync --prune` 이면 되고, 이때 그 문제에
제출이 달려 있으면 삭제 대신 미공개 처리된다. 커밋 30건은 이 능력을 더해 주지 않으면서
히스토리에서 도구 변경을 묻는다.

## 리스크 / 미지수
- 부동소수점 허용 오차 설정이 문제마다 다르다. 너무 좁으면 정답이 `WA`, 너무 넓으면 오답이 `AC`가 된다. 문제별로 근사 풀이와 잘못된 풀이 둘 다로 경계를 확인한다.
- 30문제로 체류 시간이 부족할 수 있다. 개념 문서 연결이 이 부족을 일부 메운다.

### 처리한 것

**허용 오차는 전 문제가 기본값(`rtol 1e-5`, `atol 1e-8`)을 쓴다.** 문제별로 좁히지
않았다. 대신 **정답 구현끼리 값이 갈릴 수 있는 입력을 케이스에서 뺐다** — 이쪽이
근본이다. 세 곳에서 실제로 걸렀다.

- `numerical-gradient`: `h` 를 `1e-7` 이상으로만 준다. 더 작으면 `f(x+h) − f(x−h)` 가
  자릿수 소실에 지배되어 호너 방법과 거듭제곱 합이 다른 답을 낸다. 그러면 이 문제는
  "중심 차분을 구현했는가"가 아니라 "정확히 같은 순서로 계산했는가"를 묻게 된다.
- `determinant`·`linear-system`: 대각 우세 행렬만 쓴다. 조건수가 나쁜 행렬은 피벗팅
  유무로 자릿수가 갈린다.
- `power-iteration`: 고윳값을 지정해 행렬을 만든다. 난수 대칭 행렬은 1위와 2위가
  가까워질 수 있고, 그러면 반복 횟수에 따라 답이 갈려 "정답이 하나"라는 전제가 깨진다.

**"잘못된 풀이로 경계를 확인한다"는 부분은 우회 샘플 30건이 담당한다.** 다만 그것은
`FBD` 경계이지 `WA` 경계가 아니다. 수치가 미묘하게 틀린 풀이가 `AC` 로 새는지는
케이스 설계로만 막았다 — 각 `generator.py` 의 docstring 에 그 문제에서 무엇을 갈라내려
했는지 적어 두었다(축 뒤집기, 분모 `n` vs `n-1`, 동점 처리, 편향 보정 누락 등).
이것은 검증이 아니라 설계 의도이며, 실제 오답 표본으로 확인한 것은 아니다.

## 주의
- **기대값을 손으로 수정하지 않는다**(INV-10). `WA`가 나면 `reference.py`를 고치고 재생성한다.
- 게이트 5번(우회 샘플 차단)이 이 플랫폼의 존재 이유다. 이것이 안 되면 일반 저지와 다를 바 없다.
- 게이트 2번이 통과했다고 채점이 정확한 것은 아니다. 게이트 5번과 함께여야 의미가 있다.
