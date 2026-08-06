"""KNN 케이스.

동점 규칙을 실제로 시험하는 케이스를 앞쪽에 둔다. 격자 위의 점과 정수 좌표 질의를
쓰면 거리 동점이 반드시 생기고, `k` 를 짝수로 두면 투표 동점도 생긴다. 난수 실수
데이터만 주면 두 규칙 모두 한 번도 발동하지 않는다.

`k = n` 케이스는 모든 질의가 같은 답(전체 최빈 클래스)을 내는 경계다.
"""

import numpy as np

SEED = 20260814


def generate():
    yield (
        np.array([[0.0, 0.0], [1.0, 1.0], [2.0, 2.0]]),
        np.array([0, 0, 1]),
        np.array([[0.1, 0.1], [2.1, 2.1]]),
        1,
        2,
    )

    # 거리 동점 — 질의에서 같은 거리에 있는 두 점의 레이블이 다르다.
    yield (
        np.array([[-1.0, 0.0], [1.0, 0.0]]),
        np.array([1, 0]),
        np.array([[0.0, 0.0]]),
        1,
        2,
    )

    # 투표 동점 — k = 2 에 서로 다른 레이블 둘.
    yield (
        np.array([[0.0], [1.0], [5.0]]),
        np.array([1, 0, 1]),
        np.array([[0.5]]),
        2,
        2,
    )

    # k = n
    yield (
        np.array([[0.0], [1.0], [2.0], [3.0]]),
        np.array([0, 1, 1, 2]),
        np.array([[0.0], [3.0]]),
        4,
        3,
    )

    rng = np.random.default_rng(SEED)

    # 정수 격자 — 동점이 자연스럽게 많이 생긴다.
    grid = np.array([[i, j] for i in range(6) for j in range(6)], dtype=float)
    yield (grid, rng.integers(0, 3, size=grid.shape[0]), grid[::4] + 0.0, 4, 3)

    for n, p, m, k, classes in [
        (20, 2, 5, 3, 2),
        (50, 4, 20, 5, 3),
        (200, 8, 60, 7, 4),
        (500, 10, 200, 9, 5),
    ]:
        # 클래스별로 중심을 떨어뜨려 예측이 의미를 갖게 한다.
        centers = rng.normal(size=(classes, p)) * 3.0
        labels = rng.integers(0, classes, size=n)
        train = centers[labels] + rng.normal(size=(n, p))
        yield (train, labels, rng.normal(size=(m, p)) * 3.0, k, classes)
