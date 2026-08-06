"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

from scipy.special import expit


def solve(x, y, w, b, lr):
    residual = expit(x @ w + b) - y
    n = x.shape[0]
    return (w - lr * (x.T @ residual / n), float(b - lr * residual.mean()))
