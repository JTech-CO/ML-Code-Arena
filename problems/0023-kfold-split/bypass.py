"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

import numpy as np


def solve(n, k):
    return list(np.array_split(np.arange(n), k))
