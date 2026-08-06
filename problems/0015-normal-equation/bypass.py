"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

import numpy as np


def solve(x, y):
    design = np.hstack([np.ones((x.shape[0], 1)), x])
    return np.linalg.lstsq(design, y, rcond=None)[0]
