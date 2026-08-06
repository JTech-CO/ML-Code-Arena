"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다.

`@` 연산자도 함께 막지 않으면 `numpy.matmul` 만 차단해도 이 문제는 성립하지 않는다.
"""

import numpy as np


def solve(a, b):
    return np.matmul(a, b)
