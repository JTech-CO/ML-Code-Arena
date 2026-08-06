"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

import numpy as np


def solve(a):
    return float(np.linalg.det(a))
