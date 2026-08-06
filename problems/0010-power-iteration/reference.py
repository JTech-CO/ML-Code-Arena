import numpy as np


def solve(a, iterations):
    n = a.shape[0]

    v = np.ones(n)
    v = v / np.sqrt((v * v).sum())

    for _ in range(iterations):
        w = a @ v
        v = w / np.sqrt((w * w).sum())

    eigenvalue = float(v @ (a @ v))

    pivot = int(np.argmax(np.abs(v)))
    if v[pivot] < 0:
        v = -v

    return (eigenvalue, v)
