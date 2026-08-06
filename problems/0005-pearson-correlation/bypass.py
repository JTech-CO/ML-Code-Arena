"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

import numpy as np


def solve(x):
    return np.corrcoef(x, rowvar=False)
