"""평균 정밀도 케이스.

점수에 동점을 만들지 않는다 — 문제가 동점이 없다고 명시했으므로, 동점 케이스를 넣으면
사양에 없는 것을 채점하게 된다. 난수 실수는 사실상 동점이 나오지 않지만, 정렬 후
인접 값을 확인해 확실히 한다.

**양성이 하나뿐인 케이스**를 여러 개 넣는다. AP 가 `1 / (양성의 순위)` 로 딱 떨어져
손으로 검산할 수 있고, 재현율 증가폭을 잘못 잡은 풀이가 즉시 드러난다.

불균형(양성 1%)이 이 지표의 존재 이유다. 그 규모를 반드시 포함한다.
"""

import numpy as np

SEED = 20260822


def _distinct(rng, n):
    """동점이 없는 점수를 만든다."""
    scores = rng.normal(size=n)
    while True:
        ordered = np.sort(scores)
        if not np.any(np.diff(ordered) == 0):
            return scores
        scores = rng.normal(size=n)


def generate():
    yield (np.array([0, 1, 1, 0]), np.array([0.1, 0.9, 0.6, 0.4]))
    yield (np.array([1, 0, 1]), np.array([0.9, 0.8, 0.7]))

    # 양성 하나 — AP = 1 / 순위
    yield (np.array([1, 0, 0, 0]), np.array([0.9, 0.8, 0.7, 0.6]))
    yield (np.array([0, 0, 0, 1]), np.array([0.9, 0.8, 0.7, 0.6]))

    # 전부 양성 — AP = 1.0
    yield (np.array([1, 1, 1]), np.array([0.3, 0.2, 0.1]))

    rng = np.random.default_rng(SEED)

    for n, positive_rate, separation in [
        (20, 0.5, 1.0),
        (100, 0.2, 0.8),
        (1000, 0.05, 1.2),
        (5000, 0.01, 1.5),
    ]:
        truth = (rng.random(n) < positive_rate).astype(np.int64)
        if truth.sum() == 0:
            truth[0] = 1
        yield (truth, _distinct(rng, n) + truth * separation)

    # 점수가 레이블과 무관 — AP 가 양성 비율 근처로 내려간다.
    truth = (rng.random(500) < 0.1).astype(np.int64)
    if truth.sum() == 0:
        truth[0] = 1
    yield (truth, _distinct(rng, 500))
