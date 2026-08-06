import numpy as np


def solve(a, b, c, x0, lr, steps):
    trajectory = np.empty(steps + 1, dtype=float)
    trajectory[0] = x0

    x = float(x0)
    for index in range(steps):
        x = x - lr * (2.0 * a * x + b)
        trajectory[index + 1] = x

    return trajectory
