import numpy as np


def _sigmoid(z):
    positive = z >= 0
    result = np.empty(z.shape, dtype=float)
    result[positive] = 1.0 / (1.0 + np.exp(-z[positive]))
    exponentiated = np.exp(z[~positive])
    result[~positive] = exponentiated / (1.0 + exponentiated)
    return result


def solve(x, y, w, b, lr):
    n = x.shape[0]
    residual = _sigmoid(x @ w + b) - y

    gradient_w = x.T @ residual / n
    gradient_b = residual.sum() / n

    return (w - lr * gradient_w, float(b - lr * gradient_b))
