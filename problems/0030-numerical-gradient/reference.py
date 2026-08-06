import numpy as np


def _evaluate(coeffs, x):
    """호너 방법 — 높은 차수부터 접어 내려간다."""
    result = np.zeros_like(x, dtype=float)
    for coefficient in coeffs:
        result = result * x + coefficient
    return result


def solve(coeffs, x, h):
    return (_evaluate(coeffs, x + h) - _evaluate(coeffs, x - h)) / (2.0 * h)
