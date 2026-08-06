"""모멘텀 케이스.

**조건수가 큰 행렬**을 넣는다. 고윳값이 크게 벌어진 2차 형식이 모멘텀이 존재하는 이유다.
좁은 골짜기에서 일반 경사하강은 지그재그로 내려가고 모멘텀은 밀고 간다. 두 알고리즘의
궤적이 여기서 가장 크게 갈리므로, 모멘텀을 빠뜨린 풀이가 확실히 드러난다.

`beta = 0` 은 일반 경사하강과 같아야 하는 경계다.
`steps = 1` 은 `v = g` 인 첫 스텝만 보는 경계로, 속도 갱신 순서를 바꾼 풀이를 잡는다.
"""

import numpy as np

SEED = 20260827


def _quadratic(rng, eigenvalues):
    n = len(eigenvalues)
    q, _ = np.linalg.qr(rng.normal(size=(n, n)))
    return q @ np.diag(np.asarray(eigenvalues, dtype=float)) @ q.T


def generate():
    yield (np.array([[1.0]]), np.array([1.0]), 0.1, 0.9, 2)

    # beta = 0 — 일반 경사하강과 같다.
    yield (np.diag([1.0, 2.0]), np.array([1.0, 1.0]), 0.1, 0.0, 20)

    # steps = 1 — v = g 인 첫 스텝만.
    yield (np.diag([3.0, 0.5]), np.array([2.0, -1.0]), 0.05, 0.95, 1)

    # steps = 0 — 아무것도 하지 않는다.
    yield (np.diag([1.0]), np.array([7.0]), 0.1, 0.9, 0)

    rng = np.random.default_rng(SEED)

    # 조건수가 큰 골짜기 — 모멘텀의 존재 이유.
    yield (_quadratic(rng, [10.0, 0.1]), np.array([1.0, 1.0]), 0.02, 0.9, 200)
    yield (_quadratic(rng, [50.0, 5.0, 0.5, 0.05]), rng.normal(size=4), 0.005, 0.95, 300)

    for spectrum, lr, beta, steps in [
        ([1.0, 2.0, 3.0], 0.1, 0.5, 50),
        ([4.0, 1.0], 0.1, 0.8, 100),
        ([2.0, 1.5, 1.0, 0.8, 0.5], 0.05, 0.9, 200),
        (list(np.linspace(5.0, 0.5, 20)), 0.02, 0.9, 300),
    ]:
        matrix = _quadratic(rng, spectrum)
        yield (matrix, rng.normal(size=len(spectrum)), lr, beta, steps)
