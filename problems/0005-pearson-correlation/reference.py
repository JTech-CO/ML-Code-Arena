import numpy as np


def solve(x):
    n = x.shape[0]
    centered = x - x.mean(axis=0)
    covariance = centered.T @ centered / (n - 1)
    sigma = np.sqrt(np.diag(covariance))
    return covariance / (sigma[:, None] * sigma[None, :])
