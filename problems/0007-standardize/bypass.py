"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다.

`numpy.mean` 만 막고 배열의 `.mean()` 메서드를 놓치면 이 풀이가 통과한다.
"""


def solve(x):
    return (x - x.mean(axis=0)) / x.std(axis=0)
