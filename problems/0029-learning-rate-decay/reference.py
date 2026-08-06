import numpy as np


def solve(kind, lr0, total_steps, gamma, step_size, lr_min):
    steps = np.arange(total_steps)

    if kind == "step":
        return lr0 * gamma ** (steps // step_size)

    if kind == "exponential":
        return lr0 * np.exp(-gamma * steps)

    return lr_min + (lr0 - lr_min) * (1.0 + np.cos(np.pi * steps / total_steps)) / 2.0
