"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

import numpy as np
from scipy.stats import entropy


def solve(labels, mask, n_classes):
    def h(subset):
        if subset.shape[0] == 0:
            return 0.0
        return float(entropy(np.bincount(subset, minlength=n_classes), base=2))

    n = labels.shape[0]
    left, right = labels[mask], labels[~mask]
    parent = h(labels)
    children = left.shape[0] / n * h(left) + right.shape[0] / n * h(right)
    return (parent, children, parent - children)
