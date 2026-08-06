"""브로드캐스팅 케이스 — 성립하는 짝과 성립하지 않는 짝을 섞는다.

앞쪽은 손으로 고른 경계 사례다. 크기 0, 스칼라, 축 수가 다른 경우처럼 규칙의 갈래마다
하나씩 둔다. 뒤쪽은 난수로 채워 손으로 고른 것에 없는 조합을 덮는다.
"""

import numpy as np

SEED = 20260801

FIXED = [
    ((3, 1), (1, 4)),
    ((5, 3), (3,)),
    ((5, 3), (5,)),
    ((2, 3), ()),
    ((), ()),
    ((0,), (1,)),
    ((0,), (3,)),
    ((1, 1, 1), (2, 3, 4)),
    ((7, 1, 5), (4, 5)),
    ((2, 3, 4), (2, 1, 4)),
    ((6,), (1, 6)),
    ((3, 4), (4, 3)),
]


def generate():
    for pair in FIXED:
        yield pair

    rng = np.random.default_rng(SEED)
    for _ in range(18):
        rank_a = int(rng.integers(1, 4))
        rank_b = int(rng.integers(1, 4))
        shape_a = tuple(int(rng.choice([1, 2, 3, 4, 5])) for _ in range(rank_a))
        shape_b = tuple(int(rng.choice([1, 2, 3, 4, 5])) for _ in range(rank_b))
        yield (shape_a, shape_b)
