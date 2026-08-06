"""정보 이득 케이스.

세 가지를 반드시 덮는다.

- **한쪽 자식이 빈 분할** — 가중치가 0 이므로 이득도 0 이다. 빈 배열에서 평균을 내려는
  풀이는 여기서 `nan` 을 낸다
- **크기가 다른 자식** — 단순 평균한 풀이와 가중 평균한 풀이가 갈린다. 반씩 나뉜
  케이스만 주면 둘의 값이 같아 구분되지 않는다
- **완벽한 분할과 무의미한 분할** — 이득의 최댓값과 0 인 경우

클래스는 2개와 3개 이상을 섞는다. 이진 분류만 주면 밑이 2 인 로그를 잘못 써도
값이 우연히 맞는 구간이 생긴다.
"""

import numpy as np

SEED = 20260813


def generate():
    yield (np.array([0, 0, 1, 1]), np.array([True, True, False, False]), 2)

    # 한쪽 자식이 비었다.
    yield (np.array([0, 0, 1, 1]), np.array([True, True, True, True]), 2)
    yield (np.array([0, 1, 0, 1]), np.array([False, False, False, False]), 2)

    # 자식 크기가 크게 다르다 — 단순 평균한 풀이가 여기서 갈린다.
    yield (np.array([0, 0, 0, 0, 0, 1, 1, 1]), np.array([True] + [False] * 7), 2)

    # 이득이 0 인 분할 — 자식의 분포가 부모와 같다.
    yield (np.array([0, 1, 0, 1]), np.array([True, True, False, False]), 2)

    # 클래스 3개
    yield (np.array([0, 1, 2, 0, 1, 2]), np.array([True, True, True, False, False, False]), 3)
    yield (np.array([0, 0, 1, 2, 2, 2]), np.array([True, True, False, False, False, False]), 3)

    # 등장하지 않는 클래스가 있다.
    yield (np.array([1, 1, 3, 3]), np.array([True, False, True, False]), 5)

    rng = np.random.default_rng(SEED)
    for n, k in [(20, 2), (57, 3), (300, 4), (3000, 6)]:
        labels = rng.integers(0, k, size=n)
        # 레이블과 상관이 있는 분할을 만든다. 완전 무작위 분할만 주면 이득이 늘
        # 0 근처라 허용 오차 안에서 뭉개진다.
        scores = labels + rng.normal(size=n) * 0.8
        yield (labels, scores > np.median(scores), k)
