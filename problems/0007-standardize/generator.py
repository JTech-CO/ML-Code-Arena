"""표준화 케이스.

열마다 평균과 스케일을 크게 다르게 준다. 표준화의 목적이 눈금을 맞추는 것이므로,
평균만 빼고 나누지 않은 풀이나 전체 배열 하나의 통계로 나눈 풀이가 여기서 갈린다.

`n = 1` 은 넣지 않는다. 모집단 표준편차가 `0` 이 되어 문제가 정의하지 않은 경우다.
"""

import numpy as np

SEED = 20260807


def generate():
    yield (np.array([[1.0, 10.0], [3.0, 20.0], [5.0, 30.0]]),)
    yield (np.array([[0.0, 1.0], [1.0, 0.0]]),)

    rng = np.random.default_rng(SEED)
    for n, p in [(4, 3), (3, 4), (2, 2), (50, 12), (12, 50), (400, 20)]:
        data = rng.normal(size=(n, p))
        offsets = rng.normal(size=p) * 100.0
        scales = 10.0 ** rng.integers(-2, 3, size=p)
        yield (data * scales + offsets,)
