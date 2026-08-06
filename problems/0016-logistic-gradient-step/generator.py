"""로지스틱 1스텝 케이스.

`w = 0`, `b = 0` 에서 시작하는 케이스를 앞에 둔다. 예측이 정확히 0.5 라 손으로 검산할 수
있고, 부호를 뒤집은 풀이(`w + lr·dw`)가 즉시 드러난다.

`|Xw + b|` 가 큰 케이스를 반드시 넣는다. 시그모이드를 식 그대로 쓴 풀이는 여기서
`nan` 을 내고, 그 `nan` 은 기울기를 통해 결과 전체로 번진다.

`lr = 0` 케이스는 입력을 그대로 돌려주어야 한다. 갱신식을 잘못 쓴 풀이가 여기서 걸린다.
"""

import numpy as np

SEED = 20260816


def generate():
    yield (np.array([[1.0], [2.0]]), np.array([1.0, 0.0]), np.array([0.0]), 0.0, 1.0)

    # lr = 0 — 아무것도 바뀌지 않아야 한다.
    yield (
        np.array([[1.0, 2.0], [3.0, 4.0]]),
        np.array([1.0, 0.0]),
        np.array([0.5, -0.5]),
        0.25,
        0.0,
    )

    # 큰 z — 시그모이드가 포화한다.
    yield (
        np.array([[500.0], [-500.0]]),
        np.array([1.0, 0.0]),
        np.array([1.0]),
        0.0,
        0.1,
    )

    rng = np.random.default_rng(SEED)
    for n, p in [(5, 1), (20, 3), (100, 8), (1000, 20)]:
        features = rng.normal(size=(n, p))
        weights = rng.normal(size=p)
        logits = features @ weights + 0.3
        labels = (logits > 0).astype(float)
        yield (features, labels, rng.normal(size=p), float(rng.normal()), 0.1)

    # 한쪽 클래스만 있는 데이터 — 기울기가 한 방향으로만 쏠린다.
    features = rng.normal(size=(30, 4))
    yield (features, np.ones(30), np.zeros(4), 0.0, 0.5)
    yield (features, np.zeros(30), np.zeros(4), 0.0, 0.5)
