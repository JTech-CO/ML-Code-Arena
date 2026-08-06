"""k-평균 케이스.

**빈 군집**이 생기는 케이스를 반드시 넣는다. 중심 하나를 데이터에서 멀리 떨어뜨리면
아무 점도 붙지 않는다. 평균을 그대로 계산한 풀이는 여기서 `nan` 을 낸다.

거리 동점 케이스도 넣는다. 두 중심의 정확히 가운데 있는 점이다.

중심 수 `k = 1` 과 `k = n` 도 경계다. 전자는 전체 평균 하나, 후자는 각 점이 자기
군집이 되어 중심이 변하지 않는다.
"""

import numpy as np

SEED = 20260817


def generate():
    yield (
        np.array([[0.0], [1.0], [10.0], [11.0]]),
        np.array([[0.0], [10.0]]),
    )

    # 빈 군집 — 세 번째 중심에 아무도 붙지 않는다.
    yield (
        np.array([[0.0, 0.0], [1.0, 1.0], [0.5, 0.5]]),
        np.array([[0.0, 0.0], [1.0, 1.0], [100.0, 100.0]]),
    )

    # 거리 동점 — 두 중심의 정확히 가운데.
    yield (
        np.array([[0.0], [2.0], [1.0]]),
        np.array([[0.0], [2.0]]),
    )

    # k = 1
    yield (np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]), np.array([[0.0, 0.0]]))

    # k = n — 각 점이 자기 중심이므로 중심이 변하지 않는다.
    points = np.array([[0.0], [5.0], [9.0]])
    yield (points, points.copy())

    rng = np.random.default_rng(SEED)
    for n, p, k in [(20, 2, 3), (100, 4, 5), (500, 8, 6), (2000, 10, 8)]:
        centers = rng.normal(size=(k, p)) * 5.0
        assignment = rng.integers(0, k, size=n)
        data = centers[assignment] + rng.normal(size=(n, p))
        # 초기 중심은 실제 중심에서 흔들어 둔다. 정확히 맞으면 갱신이 항등이 되어
        # 갱신 단계를 구현하지 않은 풀이도 통과한다.
        yield (data, centers + rng.normal(size=(k, p)) * 2.0)
