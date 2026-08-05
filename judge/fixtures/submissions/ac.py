# 기대 판정: AC
import numpy as np


def solve(x):
    norms = np.sqrt((x**2).sum(axis=1, keepdims=True))
    return x / norms
