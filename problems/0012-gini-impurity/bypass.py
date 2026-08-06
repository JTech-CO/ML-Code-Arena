"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

import numpy as np


def solve(labels, n_classes):
    proportions = np.bincount(labels, minlength=n_classes) / labels.shape[0]
    return float(1.0 - (proportions**2).sum())
