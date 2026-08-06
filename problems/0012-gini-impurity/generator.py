"""지니 불순도 케이스.

**등장하지 않는 클래스**가 있는 케이스를 앞쪽에 둔다. 레이블에서 본 값만 세는 풀이는
`n_classes` 를 무시하는데, 값이 우연히 같아 통과해 버린다 — 비율이 0 인 항은 제곱해도
0 이라 합에 영향이 없기 때문이다. 그래도 케이스로 둔다. 다음 문제(정보 이득)에서 같은
실수가 자식 노드의 클래스 수를 어긋나게 만든다.

순수 노드(한 클래스만), 균등 분포(최댓값), 단일 표본을 모두 넣는다.
"""

import numpy as np

SEED = 20260812


def generate():
    yield (np.array([0, 0, 1, 1]), 2)
    yield (np.array([0, 0, 0, 0]), 2)
    yield (np.array([0, 1, 2]), 3)
    yield (np.array([1, 1, 1]), 4)
    yield (np.array([0]), 1)
    yield (np.array([3, 3, 0, 0, 1, 2]), 5)

    rng = np.random.default_rng(SEED)
    for n, k in [(10, 2), (37, 3), (100, 5), (2000, 8)]:
        yield (rng.integers(0, k, size=n), k)

    # 심하게 치우친 분포 — 다수 클래스 하나가 대부분을 차지한다.
    skewed = np.zeros(500, dtype=np.int64)
    skewed[:5] = 1
    yield (skewed, 3)
