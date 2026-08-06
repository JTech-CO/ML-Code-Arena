import numpy as np


def solve(x):
    squared = np.sum(x * x, axis=1, keepdims=True)
    return x / np.sqrt(squared)
