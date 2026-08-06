import numpy as np


def solve(a, b):
    # (n, k, 1) * (1, k, m) -> (n, k, m) 을 만들고 가운데 축을 더한다.
    return (a[:, :, None] * b[None, :, :]).sum(axis=1)
