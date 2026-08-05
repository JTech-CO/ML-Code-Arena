"""`l2norm` 과 같은 정답 구현. 격리 시험만 다르게 하려고 문제를 나눴다."""

import numpy as np


def solve(x):
    norms = np.sqrt((x**2).sum(axis=1, keepdims=True))
    return x / norms
