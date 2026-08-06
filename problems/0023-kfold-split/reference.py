import numpy as np


def solve(n, k):
    base = n // k
    remainder = n % k

    folds = []
    start = 0
    for index in range(k):
        size = base + (1 if index < remainder else 0)
        folds.append(np.arange(start, start + size))
        start += size

    return folds
