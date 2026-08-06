"""혼동행렬 케이스.

**비대칭 케이스**가 핵심이다. 전치해도 같은 행렬이 나오는 데이터만 주면 축을 뒤집은
풀이가 그대로 통과한다. 앞쪽 케이스는 손으로 검산할 수 있고 전치와 구분된다.

등장하지 않는 클래스를 포함한 케이스도 넣는다. 본 클래스만으로 행렬을 만든 풀이는
크기가 달라 `shape_mismatch` 로 잡힌다.

완전 정답(대각만) 과 완전 오답도 경계다.
"""

import numpy as np

SEED = 20260819


def generate():
    yield (np.array([0, 0, 1, 1, 1]), np.array([0, 1, 1, 1, 0]), 2)

    # 완전히 한쪽으로 쏠린 오분류 — 전치와 확실히 다르다.
    yield (np.array([0, 0, 0, 0]), np.array([1, 1, 1, 1]), 2)

    # 완전 정답
    yield (np.array([0, 1, 2]), np.array([0, 1, 2]), 3)

    # 등장하지 않는 클래스가 있다.
    yield (np.array([1, 1, 3]), np.array([1, 3, 3]), 5)

    # 표본 1건
    yield (np.array([2]), np.array([0]), 3)

    rng = np.random.default_rng(SEED)
    for n, k in [(20, 2), (100, 3), (500, 5), (5000, 10)]:
        truth = rng.integers(0, k, size=n)
        # 예측을 정답에서 일부만 흔든다. 완전 무작위면 행렬이 거의 균등해져
        # 전치와의 차이가 희미해진다.
        noise = rng.random(n) < 0.3
        prediction = np.where(noise, rng.integers(0, k, size=n), truth)
        yield (truth, prediction, k)
