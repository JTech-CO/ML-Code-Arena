"""나이브 베이즈 케이스.

**특성이 많은 케이스**를 반드시 넣는다. 확률을 로그 없이 곱한 풀이는 특성이 적을 때는
통과하고 여기서 전부 0 이 되어 항상 0번 클래스를 답한다.

**사전확률이 크게 치우친 케이스**도 넣는다. 사전확률을 빼먹은 풀이는 균등한 데이터에서는
답이 같아 통과한다.

분산이 0 인 특성(클래스 안에서 값이 상수)도 넣는다. 바닥값을 더하지 않으면 0 으로 나눈다.
"""

import numpy as np

SEED = 20260818


def generate():
    yield (
        np.array([[0.0], [0.2], [5.0], [5.2]]),
        np.array([0, 0, 1, 1]),
        np.array([[0.1], [5.1]]),
        2,
    )

    # 클래스 0 의 특성이 상수 — 분산이 0 이다.
    yield (
        np.array([[1.0, 0.0], [1.0, 1.0], [4.0, 0.0], [6.0, 1.0]]),
        np.array([0, 0, 1, 1]),
        np.array([[1.0, 0.5], [5.0, 0.5]]),
        2,
    )

    rng = np.random.default_rng(SEED)

    # 특성이 많다 — 곱셈 풀이가 언더플로한다.
    for p in [30, 80]:
        centers = rng.normal(size=(3, p)) * 2.0
        labels = rng.integers(0, 3, size=150)
        train = centers[labels] + rng.normal(size=(150, p))
        yield (train, labels, rng.normal(size=(40, p)) * 2.0, 3)

    # 사전확률이 치우쳤다 — 90 대 10.
    skewed = np.concatenate([np.zeros(90, dtype=np.int64), np.ones(10, dtype=np.int64)])
    centers = np.array([[0.0, 0.0], [1.0, 1.0]])
    train = centers[skewed] + rng.normal(size=(100, 2)) * 1.5
    yield (train, skewed, rng.normal(size=(30, 2)), 2)

    for n, p, k, m in [(30, 3, 2, 10), (200, 6, 4, 50), (1000, 12, 5, 200)]:
        centers = rng.normal(size=(k, p)) * 3.0
        labels = rng.integers(0, k, size=n)
        train = centers[labels] + rng.normal(size=(n, p))
        yield (train, labels, rng.normal(size=(m, p)) * 3.0, k)
