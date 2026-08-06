"""연립방정식 케이스.

대각 우세 행렬만 쓴다. 조건수가 나쁜 행렬을 넣으면 피벗팅 유무에 따라 답의 자릿수가
갈리고, 그러면 이 문제는 "소거법을 구현했는가"가 아니라 "정확히 같은 순서로 계산했는가"를
묻게 된다.

첫 열의 피벗이 0 인 케이스를 하나 둔다. 피벗팅을 아예 하지 않은 풀이는 여기서
0 으로 나눈다.
"""

import numpy as np

SEED = 20260809


def _dominant(rng, n):
    matrix = rng.normal(size=(n, n))
    matrix[np.arange(n), np.arange(n)] = np.abs(matrix).sum(axis=1) + 1.0
    return matrix


def generate():
    yield (np.array([[2.0, 1.0], [1.0, 3.0]]), np.array([3.0, 5.0]))
    yield (np.array([[5.0]]), np.array([10.0]))
    yield (np.eye(4), np.array([1.0, -2.0, 3.0, -4.0]))

    # 첫 피벗이 0 — 행을 교환해야 풀린다.
    yield (np.array([[0.0, 2.0], [3.0, 1.0]]), np.array([4.0, 5.0]))

    rng = np.random.default_rng(SEED)
    for n in [2, 3, 5, 8, 20, 40]:
        yield (_dominant(rng, n), rng.normal(size=n))
