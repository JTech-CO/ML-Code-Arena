"""공분산 케이스.

`n` 과 `p` 를 다르게 둔다. 정사각 데이터(`n = p`)만 주면 축을 뒤집은 풀이 —
표본과 특성을 바꿔 계산하는 것 — 가 shape 검사를 통과한다.

`n = 2` 를 넣어 분모가 `n - 1 = 1` 이 되는 경계를 본다. 여기서 `n` 으로 나눈 풀이와
`n - 1` 로 나눈 풀이의 차이가 2배로 벌어져 가장 크게 드러난다.
"""

import numpy as np

SEED = 20260804


def generate():
    yield (np.array([[1.0, 2.0], [2.0, 4.0], [3.0, 6.0]]),)
    yield (np.array([[1.0], [3.0]]),)
    yield (np.array([[0.0, 1.0], [1.0, 0.0]]),)

    rng = np.random.default_rng(SEED)
    for n, p in [(5, 3), (3, 5), (4, 4), (40, 6), (6, 40), (300, 20)]:
        # 상관이 있는 데이터를 만든다. 독립 난수만 주면 비대각 성분이 0 근처라
        # 비대각을 아예 계산하지 않는 풀이도 허용 오차 안에 들어올 수 있다.
        base = rng.normal(size=(n, 2))
        mixing = rng.normal(size=(2, p))
        yield (base @ mixing + 0.3 * rng.normal(size=(n, p)),)
