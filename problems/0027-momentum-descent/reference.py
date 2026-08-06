import numpy as np


def solve(a, x0, lr, beta, steps):
    x = x0.astype(float).copy()
    v = np.zeros_like(x)

    for _ in range(steps):
        gradient = a @ x
        v = beta * v + gradient
        x = x - lr * v

    return (x, v)
