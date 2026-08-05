"""정답 구현. 기대값은 여기서만 만들어진다 (INV-10).

`numpy.linalg.norm` 은 이 문제에서 금지되어 있으므로 기준 구현도 쓰지 않는다.
기준 구현이 금지 API 를 쓰면 출제자가 제한을 잘못 걸었다는 신호다.
"""

import numpy as np


def solve(x):
    norms = np.sqrt((x**2).sum(axis=1, keepdims=True))
    return x / norms
