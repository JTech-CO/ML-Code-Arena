"""행렬 곱 케이스.

`n`·`k`·`m` 을 모두 다르게 둔다. 정사각 행렬만 주면 `A B` 와 `B A` 를 바꿔 써도 shape
검사를 통과해 버린다.

행 벡터·열 벡터 모양(`k = 1`, `n = 1`)도 넣는다. 축이 하나 줄어드는 경계에서 브로드캐스팅
방식 풀이가 자주 어긋난다.
"""

import numpy as np

SEED = 20260803

SHAPES = [
    (2, 2, 2),
    (1, 4, 1),
    (3, 1, 5),
    (1, 1, 1),
    (4, 3, 2),
    (2, 3, 4),
    (10, 7, 3),
    (60, 50, 40),
]


def generate():
    yield (
        np.array([[1.0, 2.0], [3.0, 4.0]]),
        np.array([[5.0, 6.0], [7.0, 8.0]]),
    )

    rng = np.random.default_rng(SEED)
    for n, k, m in SHAPES:
        yield (rng.normal(size=(n, k)), rng.normal(size=(k, m)))
