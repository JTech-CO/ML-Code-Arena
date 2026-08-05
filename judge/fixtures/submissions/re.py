# 기대 판정: RE — 실행 중 예외.
import numpy as np


def solve(x):
    norms = np.sqrt((x**2).sum(axis=1, keepdims=True))
    raise ValueError("의도적으로 발생시킨 런타임 오류")
    return x / norms
