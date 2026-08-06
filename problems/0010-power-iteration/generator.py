"""거듭제곱법 케이스.

고윳값을 지정해 대칭 행렬을 만든다. `Q diag(λ) Qᵀ` 형태이며 `Q` 는 직교행렬이다.
난수 대칭 행렬을 그냥 쓰면 1위와 2위 고윳값이 가까워질 수 있고, 그러면 반복 횟수에 따라
답이 갈려 "정답이 하나"라는 전제가 깨진다.

**음수 고윳값이 최대인 경우**를 반드시 넣는다. 절댓값 기준이라는 조건을 놓친 풀이와
부호 규약을 무시한 풀이가 여기서 갈린다.

반복 횟수는 넉넉히 준다. 수렴 속도는 1위와 2위 고윳값의 비에 달렸으므로, 비가 2 이상이면
200회에서 배정도 정밀도까지 수렴한다.
"""

import numpy as np

SEED = 20260810


def _symmetric(rng, eigenvalues):
    n = len(eigenvalues)
    q, _ = np.linalg.qr(rng.normal(size=(n, n)))
    return q @ np.diag(np.asarray(eigenvalues, dtype=float)) @ q.T


def generate():
    yield (np.array([[2.0, 0.0], [0.0, 1.0]]), 50)
    yield (np.diag([1.0, 5.0, 2.0]), 200)

    # 최대 고윳값이 음수 — 절댓값 기준이라는 점이 여기서 갈린다.
    yield (np.diag([-8.0, 1.0, 3.0]), 200)

    rng = np.random.default_rng(SEED)

    for spectrum in [
        [10.0, 5.0, 3.0, 2.0, 1.0],
        [7.0, -3.5, 1.0],
        [-12.0, 6.0, 2.0, 1.0],
        [4.0, 2.0],
        [20.0, 9.0, 8.0, 7.0, 6.0, 5.0, 4.0, 3.0],
    ]:
        yield (_symmetric(rng, spectrum), 200)

    # 규모가 큰 행렬 — 반복 200회 × (60, 60) 행렬곱이면 실행 시간에 여유가 있다.
    large = _symmetric(rng, list(np.linspace(30.0, 1.0, 60)))
    yield (large, 200)
