"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

import numpy as np
from sklearn.model_selection import StratifiedKFold


def solve(y, k):
    splitter = StratifiedKFold(n_splits=k, shuffle=False)
    return [np.sort(test) for _, test in splitter.split(np.zeros((y.shape[0], 1)), y)]
