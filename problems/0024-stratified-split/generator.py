"""층화 분할 케이스.

**불균형 데이터**가 핵심이다. 클래스가 고르면 층화 분할과 단순 분할의 결과가 비슷해져
층화하지 않은 풀이도 통과한다. 소수 클래스가 겹 수와 비슷한 규모인 케이스를 넣는다.

클래스가 인덱스 순으로 뭉쳐 있는 케이스와 흩어져 있는 케이스를 모두 넣는다. 뭉친
데이터에서는 층화하지 않으면 어떤 겹에 한 클래스가 통째로 들어간다 — 층화가 존재하는
이유가 바로 이 상황이다.
"""

import numpy as np

SEED = 20260824


def generate():
    yield (np.array([0, 0, 0, 0, 1, 1]), 2)

    # 클래스가 뭉쳐 있다 — 층화 없이 자르면 겹마다 한 클래스만 들어간다.
    yield (np.concatenate([np.zeros(9, dtype=np.int64), np.ones(6, dtype=np.int64)]), 3)

    # 소수 클래스의 표본 수가 겹 수와 같다 — 겹마다 정확히 하나씩.
    yield (np.array([0, 0, 0, 0, 0, 0, 1, 1, 1]), 3)

    # 클래스 3개, 크기가 모두 다르다.
    yield (np.array([0] * 10 + [1] * 7 + [2] * 4), 2)

    rng = np.random.default_rng(SEED)

    for n, weights, k in [
        (30, [0.5, 0.5], 3),
        (100, [0.7, 0.3], 5),
        (200, [0.5, 0.3, 0.2], 4),
        (1000, [0.9, 0.07, 0.03], 5),
        (3000, [0.4, 0.3, 0.2, 0.1], 10),
    ]:
        labels = rng.choice(len(weights), size=n, p=weights)
        # 각 클래스가 겹 수 이상이 되도록 보정한다. 문제가 그렇게 전제했다.
        for label in range(len(weights)):
            shortage = k - int((labels == label).sum())
            if shortage > 0:
                spots = np.nonzero(labels != label)[0][:shortage]
                labels[spots] = label
        yield (labels, k)
