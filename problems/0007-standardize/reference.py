import numpy as np


def solve(x):
    n = x.shape[0]
    centered = x - x.sum(axis=0) / n
    sigma = np.sqrt((centered * centered).sum(axis=0) / n)
    return centered / sigma
