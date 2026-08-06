import numpy as np


def solve(z):
    positive = z >= 0
    result = np.empty(z.shape, dtype=float)

    result[positive] = 1.0 / (1.0 + np.exp(-z[positive]))

    exponentiated = np.exp(z[~positive])
    result[~positive] = exponentiated / (1.0 + exponentiated)

    return result
