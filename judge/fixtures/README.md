# judge/fixtures/ — M1 게이트 고정 샘플

`node tools/judge-fixtures.js` 가 이 디렉터리를 써서 M1 DoD 를 전부 검증한다.

## 구조

| 경로 | 역할 |
|---|---|
| `problems/l2norm/` | 판정 재현용 고정 문제. 제한이 **엄격**하다 (numpy·math 만 허용) |
| `problems/sandbox-probe/` | 격리 검증용. 제한이 **느슨**하다 (socket·open 허용) |
| `submissions/` | 판정 1종씩을 유발하는 제출 샘플 |
| `broken-cases/` | 일부러 깨뜨린 케이스 파일 → `IE` |

`cases/` 는 커밋하지 않는다(INV-2). `--prepare` 로 언제든 재생성된다(INV-10).

## 왜 문제가 둘인가

AST 정적 검사와 컨테이너 격리는 **서로 다른 방어층**이다.

`l2norm` 은 `socket` 도 `open` 도 화이트리스트에 없으므로, 네트워크를 시도하는 제출은
컨테이너에 닿기도 전에 `FBD` 로 끝난다. 그러면 "네트워크가 막혀 있다"를 확인할 수 없다.
`sandbox-probe` 는 앞 층을 일부러 열어 **뒤 층만** 시험한다.

앞 층이 뒤 층을 가리면 뒤 층이 언제 무너졌는지 알 수 없다. 두 층을 따로 시험하는 이유다.

## 샘플이 판정으로 답하게 만든 것들

관측 불가능한 것을 관측 가능하게 바꾼 설계다. 컨테이너의 `/tmp` 는 컨테이너와 함께
사라지므로 밖에서 확인할 수 없다. 그래서 판정 자체가 증거가 되게 짰다.

| 샘플 | 기대 | 어긋나면 |
|---|---|---|
| `fbd.py` | `FBD` | `RE` = 모듈 최상위가 실행됐다 → **INV-6 위반** |
| `network.py` | `RE` | `AC` = 외부 접속이 성공했다 → **INV-4 위반** |
| `tmp_read.py` | `AC` | `WA` = 이전 제출의 `/tmp` 가 남아 있다 → **INV-8 위반** |

`fbd.py` 는 모듈 최상위에 부작용과 `raise` 를 함께 둔다. 검사가 import 보다 먼저 돌면
그 줄들은 실행되지 않고 `FBD` 가 나온다. 순서가 뒤집히면 `raise` 가 먼저 터져 `RE` 가 된다.

## 실행

~~~bash
pnpm judge:image                                    # 이미지 빌드
pnpm judge -- --prepare --problem l2norm            # 케이스 생성 (INV-10)
pnpm judge:fixtures                                 # M1 게이트 전체
~~~
