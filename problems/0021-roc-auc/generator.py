"""AUC 케이스.

**동점이 있는 케이스**가 핵심이다. 점수를 소수 몇 자리로 반올림하면 동점이 대량으로
생긴다. 동점을 계단으로 처리한 풀이는 연속 점수 케이스를 전부 통과하고 여기서 갈린다.

완벽 분리(1.0), 완전 역전(0.0), 무작위(0.5 근처)를 모두 넣는다. 특히 0.0 케이스는
부호나 정렬 방향을 뒤집은 풀이를 잡는다 — 그런 풀이는 0.5 근처 데이터에서 통과한다.

모든 점수가 같은 케이스는 AUC 가 정확히 0.5 다.
"""

import numpy as np

SEED = 20260821


def generate():
    yield (np.array([0, 0, 1, 1]), np.array([0.1, 0.4, 0.35, 0.8]))
    yield (np.array([0, 1]), np.array([0.5, 0.5]))

    # 완벽 분리
    yield (np.array([0, 0, 1, 1]), np.array([0.1, 0.2, 0.8, 0.9]))

    # 완전 역전 — 정렬 방향을 뒤집은 풀이가 여기서 잡힌다.
    yield (np.array([1, 1, 0, 0]), np.array([0.1, 0.2, 0.8, 0.9]))

    # 모든 점수가 같다.
    yield (np.array([0, 1, 1, 0, 1]), np.full(5, 0.3))

    rng = np.random.default_rng(SEED)

    for n, positive_rate, separation in [(20, 0.5, 1.0), (200, 0.2, 0.5), (2000, 0.05, 1.5)]:
        truth = (rng.random(n) < positive_rate).astype(np.int64)
        if truth.sum() == 0:
            truth[0] = 1
        if truth.sum() == n:
            truth[0] = 0
        yield (truth, rng.normal(size=n) + truth * separation)

    # 동점이 많다 — 소수 첫째 자리로 반올림한다.
    for n in [50, 500, 3000]:
        truth = (rng.random(n) < 0.4).astype(np.int64)
        if truth.sum() in (0, n):
            truth[0] = 1 - truth[0]
        scores = np.round(rng.normal(size=n) + truth * 0.8, 1)
        yield (truth, scores)
