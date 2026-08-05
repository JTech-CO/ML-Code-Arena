"""격리 시험용이므로 케이스는 작고 빠른 것 하나면 충분하다."""

import numpy as np

SEED = 20260806


def generate():
    rng = np.random.default_rng(SEED)
    x = rng.normal(size=(4, 3))
    zero_rows = np.sqrt((x**2).sum(axis=1)) < 1e-6
    x[zero_rows] += 1.0
    return [[x]]
