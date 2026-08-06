import numpy as np


def solve(x):
    n = x.shape[0]
    centered = x - x.mean(axis=0)
    return centered.T @ centered / (n - 1)
