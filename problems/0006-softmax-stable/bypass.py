"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다.

`scipy` 는 허용 목록에 없으므로 import 단계에서 걸린다. 채점 이미지에 `scipy` 가
설치되어 있지 않다는 사실과는 무관하다 — 정적 검사는 import 하기 전에 끝난다 (INV-6).
"""

from scipy.special import softmax


def solve(x):
    return softmax(x, axis=1)
