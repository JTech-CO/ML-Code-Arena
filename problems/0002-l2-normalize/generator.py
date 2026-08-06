"""정규화 케이스.

정사각이 아닌 shape 을 앞쪽에 둔다. `(n, n)` 만 주면 축을 바꿔 써도 통과해 버리고,
그 실수는 실제 데이터에서 열 단위 정규화로 나타난다.

노름이 0 인 행은 만들지 않는다 — 문제가 그 경우를 정의하지 않았으므로 케이스로 두면
사양에 없는 것을 채점하게 된다.
"""

import numpy as np

SEED = 20260802


def generate():
    yield (np.array([[3.0, 4.0], [1.0, 0.0]]),)
    yield (np.array([[1.0, 1.0, 1.0, 1.0]]),)
    yield (np.array([[-3.0, 4.0], [0.0, -5.0], [6.0, 8.0]]),)

    rng = np.random.default_rng(SEED)
    for rows, cols in [(1, 1), (2, 7), (7, 2), (20, 3), (3, 20), (200, 50)]:
        x = rng.normal(size=(rows, cols))
        # 노름이 0 에 가까운 행은 부동소수점 오차가 상대오차로 증폭된다.
        # 그 행을 원점에서 밀어내 케이스가 허용 오차를 시험하지 않도록 한다.
        norms = np.sqrt(np.sum(x * x, axis=1, keepdims=True))
        x = np.where(norms < 0.1, x + 1.0, x)
        yield (x,)

    # 스케일이 큰 값과 작은 값이 섞이면 제곱 합에서 자릿수가 소실될 수 있다.
    yield (np.array([[1e6, 1e-6], [1e-6, 1e6], [1e3, 1e3]]),)
